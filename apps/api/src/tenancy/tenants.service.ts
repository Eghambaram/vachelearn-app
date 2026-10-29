import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateTenantBody,
  TenantListPage,
  TenantListQuery,
  TenantView,
  UpdateTenantBody,
} from '@vachelearn/contracts';
import type { z } from 'zod';
import type { Tenant, TenantStatus } from '../../generated/prisma/client';
import type { RequestContext } from '../access/request-context';
import { SupportSessionsService } from '../access/support-sessions.service';
import { AuditService, changedFields } from '../audit/audit.service';
import { ApiException } from '../common/errors/api-exception';
import { CURSORS, Cursors, afterCursor, queryKey } from '../common/pagination/keyset';
import { isUniqueViolation } from '../prisma/errors';
import { PrismaService } from '../prisma/prisma.service';

type CreateInput = z.output<typeof CreateTenantBody>;
type UpdateInput = z.output<typeof UpdateTenantBody>;
type ListInput = z.output<typeof TenantListQuery>;

/** Tenant lifecycle (D-066): active ⇄ suspended → archived. Archived is final. */
const TRANSITIONS = {
  suspend: { from: ['active'], to: 'suspended', action: 'tenant.suspended' },
  reactivate: { from: ['suspended'], to: 'active', action: 'tenant.reactivated' },
  archive: { from: ['active', 'suspended'], to: 'archived', action: 'tenant.archived' },
} as const satisfies Record<string, { from: TenantStatus[]; to: TenantStatus; action: string }>;
export type TenantTransition = keyof typeof TRANSITIONS;

export function toTenantView(t: Tenant): TenantView {
  return {
    id: t.id,
    slug: t.slug,
    displayName: t.displayName,
    status: t.status,
    defaultTimezone: t.defaultTimezone,
    defaultLocale: t.defaultLocale,
    primaryContactEmail: t.primaryContactEmail,
    industry: t.industry,
    suspendedAt: t.suspendedAt?.toISOString() ?? null,
    suspendedReason: t.suspendedReason,
    archivedAt: t.archivedAt?.toISOString() ?? null,
    archivedReason: t.archivedReason,
    version: t.version,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/**
 * Platform tenant management (spec §4; `tenant.*`, platform scope only). Every change runs in one transaction with
 * its audit event; edits use optimistic concurrency (`version`); state changes are explicit transitions with a reason.
 */
@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly support: SupportSessionsService,
    @Inject(CURSORS) private readonly cursors: Cursors,
  ) {}

  async create(ctx: RequestContext, input: CreateInput): Promise<TenantView> {
    try {
      const tenant = await this.prisma.$transaction(async (tx) => {
        const created = await tx.tenant.create({
          data: {
            slug: input.slug,
            displayName: input.displayName,
            defaultTimezone: input.defaultTimezone,
            defaultLocale: input.defaultLocale ?? 'en-IN',
            primaryContactEmail: input.primaryContactEmail ?? null,
            industry: input.industry ?? null,
            createdById: ctx.userId,
            settings: { create: {} },
          },
        });
        await this.audit.record(tx, {
          actorUserId: ctx.userId,
          tenantId: created.id,
          action: 'tenant.created',
          entityType: 'tenant',
          entityId: created.id,
          requestId: ctx.requestId,
          after: { slug: created.slug, displayName: created.displayName, status: created.status },
        });
        return created;
      });
      return toTenantView(tenant);
    } catch (err) {
      if (isUniqueViolation(err, 'tenants_slug_key')) {
        throw ApiException.validation([
          { field: 'slug', code: 'taken', message: 'This slug is already in use' },
        ]);
      }
      throw err;
    }
  }

  async list(input: ListInput): Promise<TenantListPage> {
    const { cursor, ...query } = input;
    const key = queryKey([
      'tenants',
      query.status ?? '',
      query.search ?? '',
      query.sort,
      query.direction,
      query.limit,
    ]);
    const position = cursor
      ? this.cursors.decode(cursor, key, query.sort === 'createdAt' ? 'instant' : 'string')
      : null;

    const rows = await this.prisma.tenant.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { displayName: { contains: query.search, mode: 'insensitive' as const } },
                { slug: { contains: query.search.toLowerCase() } },
              ],
            }
          : {}),
        ...(position ? afterCursor(query.sort, query.direction, position.value, position.id) : {}),
      },
      orderBy: [{ [query.sort]: query.direction }, { id: query.direction }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      data: page.map(toTenantView),
      page: {
        limit: query.limit,
        nextCursor:
          rows.length > query.limit && last
            ? this.cursors.encode(
                query.sort === 'createdAt' ? last.createdAt.toISOString() : last.displayName,
                last.id,
                key,
              )
            : null,
      },
    };
  }

  async get(id: string): Promise<TenantView> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw ApiException.notFound();
    return toTenantView(tenant);
  }

  async update(ctx: RequestContext, id: string, input: UpdateInput): Promise<TenantView> {
    const { version, ...patch } = input;
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.tenant.findUnique({ where: { id } });
      if (!current) throw ApiException.notFound();
      // Archived is final (D-066); editing it is a state conflict, not a silent no-op.
      if (current.status === 'archived') {
        throw new ApiException(409, 'INVALID_STATE', 'An archived tenant cannot be edited');
      }
      // Stale version: fail before diffing, so the audit pair always describes the row that was actually changed.
      if (current.version !== version) throw conflict();
      const diff = changedFields(current, patch, { personal: ['primaryContactEmail'] });
      const result = await tx.tenant.updateMany({
        where: { id, version, status: { not: 'archived' } },
        data: { ...patch, version: { increment: 1 } },
      });
      if (result.count === 0) throw conflict();
      if (diff.changed) {
        await this.audit.record(tx, {
          actorUserId: ctx.userId,
          tenantId: id,
          action: 'tenant.updated',
          entityType: 'tenant',
          entityId: id,
          requestId: ctx.requestId,
          before: diff.before,
          after: diff.after,
        });
      }
      return tx.tenant.findUniqueOrThrow({ where: { id } });
    });
    return toTenantView(updated);
  }

  async transition(ctx: RequestContext, id: string, kind: TenantTransition, reason: string) {
    const rule = TRANSITIONS[kind];
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.tenant.findUnique({ where: { id } });
      if (!current) throw ApiException.notFound();
      const lifecycle =
        kind === 'suspend'
          ? { suspendedAt: now, suspendedReason: reason, suspendedById: ctx.userId }
          : kind === 'reactivate'
            ? { suspendedAt: null, suspendedReason: null, suspendedById: null }
            : { archivedAt: now, archivedReason: reason, archivedById: ctx.userId };
      // Conditional on the current status, so two concurrent transitions cannot both apply.
      const result = await tx.tenant.updateMany({
        where: { id, status: { in: [...rule.from] } },
        data: { status: rule.to, ...lifecycle, version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new ApiException(
          409,
          'INVALID_STATE',
          `A ${current.status} tenant cannot be changed this way`,
        );
      }
      // Archiving ends every live support session into the tenant, audited (D-037, D-098).
      if (kind === 'archive') await this.support.endForTenant(tx, id, ctx);
      await this.audit.record(tx, {
        actorUserId: ctx.userId,
        tenantId: id,
        action: rule.action,
        entityType: 'tenant',
        entityId: id,
        requestId: ctx.requestId,
        reason,
        before: { status: current.status },
        after: { status: rule.to },
      });
      return tx.tenant.findUniqueOrThrow({ where: { id } });
    });
    return toTenantView(updated);
  }
}

export function conflict() {
  return new ApiException(
    409,
    'CONFLICT',
    'This record was changed by someone else. Reload and try again.',
  );
}
