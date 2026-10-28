import { Inject, Injectable } from '@nestjs/common';
import type {
  BranchListPage,
  BranchListQuery,
  BranchView,
  CreateBranchBody,
  UpdateBranchBody,
} from '@vachelearn/contracts';
import type { z } from 'zod';
import type { Branch, Prisma } from '../../generated/prisma/client';
import type { RequestContext } from '../access/request-context';
import { AuditService, changedFields } from '../audit/audit.service';
import { ApiException } from '../common/errors/api-exception';
import { CURSORS, Cursors, afterCursor, queryKey } from '../common/pagination/keyset';
import { isUniqueViolation } from '../prisma/errors';
import { PrismaService } from '../prisma/prisma.service';
import { conflict } from './tenants.service';

type CreateInput = z.output<typeof CreateBranchBody>;
type UpdateInput = z.output<typeof UpdateBranchBody>;
type ListInput = z.output<typeof BranchListQuery>;

export function toBranchView(b: Branch): BranchView {
  return {
    id: b.id,
    code: b.code,
    name: b.name,
    timezone: b.timezone,
    addressLine: b.addressLine,
    city: b.city,
    region: b.region,
    countryCode: b.countryCode,
    status: b.status,
    deactivatedAt: b.deactivatedAt?.toISOString() ?? null,
    deactivatedReason: b.deactivatedReason,
    version: b.version,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

/** The caller's tenant and branch scope (the route already required a tenant permission). */
function scopeOf(ctx: RequestContext) {
  if (!ctx.tenant) throw ApiException.notFound();
  return ctx.tenant;
}

/**
 * Branches of the caller's tenant (spec §4). The tenant comes from the request context only; every read, write and
 * list is filtered by tenant and by the caller's branch scope in the query itself, so another tenant's or another
 * branch's id is a 404 (existence never leaks). Deactivation keeps history.
 */
@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(CURSORS) private readonly cursors: Cursors,
  ) {}

  /** `where` for one branch the caller may see. */
  private visible(ctx: RequestContext, id: string): Prisma.BranchWhereInput {
    const { tenantId, branchScope } = scopeOf(ctx);
    // Branch-scoped callers: the id must also be one of their branches — in the same query, so a miss is a 404.
    return branchScope === 'ALL'
      ? { id, tenantId }
      : { id, tenantId, AND: [{ id: { in: [...branchScope] } }] };
  }

  async list(ctx: RequestContext, input: ListInput): Promise<BranchListPage> {
    const { tenantId, branchScope } = scopeOf(ctx);
    const { cursor, ...query } = input;
    // The scope is part of the key: a cursor never carries over to another tenant or scope.
    const key = queryKey([
      'branches',
      tenantId,
      branchScope === 'ALL' ? 'ALL' : [...branchScope].sort(),
      query.status ?? '',
      query.search ?? '',
      query.sort,
      query.direction,
      query.limit,
    ]);
    const position = cursor
      ? this.cursors.decode(cursor, key, query.sort === 'createdAt' ? 'instant' : 'string')
      : null;

    const rows = await this.prisma.branch.findMany({
      where: {
        AND: [
          { tenantId },
          branchScope === 'ALL' ? {} : { id: { in: [...branchScope] } },
          query.status ? { status: query.status } : {},
          query.search
            ? {
                OR: [
                  { name: { contains: query.search, mode: 'insensitive' } },
                  { code: { contains: query.search.toUpperCase() } },
                ],
              }
            : {},
          position ? afterCursor(query.sort, query.direction, position.value, position.id) : {},
        ],
      },
      orderBy: [{ [query.sort]: query.direction }, { id: query.direction }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const lastValue = (b: Branch) =>
      query.sort === 'createdAt'
        ? b.createdAt.toISOString()
        : query.sort === 'code'
          ? b.code
          : b.name;
    return {
      data: page.map(toBranchView),
      page: {
        limit: query.limit,
        nextCursor:
          rows.length > query.limit && last
            ? this.cursors.encode(lastValue(last), last.id, key)
            : null,
      },
    };
  }

  async get(ctx: RequestContext, id: string): Promise<BranchView> {
    const branch = await this.prisma.branch.findFirst({ where: this.visible(ctx, id) });
    if (!branch) throw ApiException.notFound();
    return toBranchView(branch);
  }

  async create(ctx: RequestContext, input: CreateInput): Promise<BranchView> {
    const { tenantId, branchScope } = scopeOf(ctx);
    // A branch-scoped admin could never see the branch they created; creating branches is a tenant-wide act.
    if (branchScope !== 'ALL') throw new ApiException(403, 'FORBIDDEN', 'Forbidden');
    try {
      const branch = await this.prisma.$transaction(async (tx) => {
        const created = await tx.branch.create({
          data: {
            tenantId,
            code: input.code,
            name: input.name,
            timezone: input.timezone,
            addressLine: input.addressLine ?? null,
            city: input.city ?? null,
            region: input.region ?? null,
            countryCode: input.countryCode ?? null,
            createdById: ctx.userId,
          },
        });
        await this.audit.record(tx, {
          actorUserId: ctx.userId,
          tenantId,
          branchId: created.id,
          action: 'branch.created',
          entityType: 'branch',
          entityId: created.id,
          requestId: ctx.requestId,
          after: { code: created.code, name: created.name, status: created.status },
        });
        return created;
      });
      return toBranchView(branch);
    } catch (err) {
      if (isUniqueViolation(err, 'branches_tenant_id_code_key')) {
        throw ApiException.validation([
          {
            field: 'code',
            code: 'taken',
            message: 'Another branch in this organisation uses this code',
          },
        ]);
      }
      throw err;
    }
  }

  async update(ctx: RequestContext, id: string, input: UpdateInput): Promise<BranchView> {
    const { tenantId } = scopeOf(ctx);
    const { version, ...patch } = input;
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.branch.findFirst({ where: this.visible(ctx, id) });
      if (!current) throw ApiException.notFound();
      if (current.version !== version) throw conflict();
      const diff = changedFields(current, patch);
      const result = await tx.branch.updateMany({
        where: { ...this.visible(ctx, id), version },
        data: { ...patch, version: { increment: 1 } },
      });
      if (result.count === 0) throw conflict();
      if (diff.changed) {
        await this.audit.record(tx, {
          actorUserId: ctx.userId,
          tenantId,
          branchId: id,
          action: 'branch.updated',
          entityType: 'branch',
          entityId: id,
          requestId: ctx.requestId,
          before: diff.before,
          after: diff.after,
        });
      }
      return tx.branch.findFirstOrThrow({ where: { id, tenantId } });
    });
    return toBranchView(updated);
  }

  async setActive(ctx: RequestContext, id: string, active: boolean, reason: string) {
    const { tenantId } = scopeOf(ctx);
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.branch.findFirst({ where: this.visible(ctx, id) });
      if (!current) throw ApiException.notFound();
      const from = active ? 'inactive' : 'active';
      const result = await tx.branch.updateMany({
        where: { ...this.visible(ctx, id), status: from },
        data: active
          ? {
              status: 'active',
              deactivatedAt: null,
              deactivatedReason: null,
              deactivatedById: null,
              version: { increment: 1 },
            }
          : {
              status: 'inactive',
              deactivatedAt: new Date(),
              deactivatedReason: reason,
              deactivatedById: ctx.userId,
              version: { increment: 1 },
            },
      });
      if (result.count === 0) {
        throw new ApiException(409, 'INVALID_STATE', `The branch is already ${current.status}`);
      }
      await this.audit.record(tx, {
        actorUserId: ctx.userId,
        tenantId,
        branchId: id,
        action: active ? 'branch.reactivated' : 'branch.deactivated',
        entityType: 'branch',
        entityId: id,
        requestId: ctx.requestId,
        reason,
        before: { status: current.status },
        after: { status: active ? 'active' : 'inactive' },
      });
      return tx.branch.findFirstOrThrow({ where: { id, tenantId } });
    });
    return toBranchView(updated);
  }
}
