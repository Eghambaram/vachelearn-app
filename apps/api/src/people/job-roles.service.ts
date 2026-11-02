import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateJobRoleBody,
  JobRoleListPage,
  JobRoleListQuery,
  JobRoleView,
  UpdateJobRoleBody,
} from '@vachelearn/contracts';
import type { z } from 'zod';
import type { JobRole } from '../../generated/prisma/client';
import type { RequestContext } from '../access/request-context';
import { lockTenant } from '../access/tenant-admins';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/errors/api-exception';
import { CURSORS, Cursors, afterCursor, queryKey } from '../common/pagination/keyset';
import { isUniqueViolation } from '../prisma/errors';
import { PrismaService } from '../prisma/prisma.service';
import { conflict } from '../tenancy/tenants.service';

/*
 * The tenant's job-role list (D-047): read by anyone with `tenant_settings.read` (it is not branch-owned), changed by
 * `reference_data.manage` (Tenant Admin; matrix row "Departments, job roles"). Names are unique within the tenant ignoring case. Never deleted: a
 * deactivated role stays on the members who have it and cannot be newly chosen. Every change is audited.
 */

type ListInput = z.output<typeof JobRoleListQuery>;

export function toJobRoleView(r: JobRole): JobRoleView {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    deactivatedAt: r.deactivatedAt?.toISOString() ?? null,
    deactivatedReason: r.deactivatedReason,
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function tenantOf(ctx: RequestContext) {
  if (!ctx.tenant) throw ApiException.notFound();
  return ctx.tenant.tenantId;
}

const nameTaken = () =>
  ApiException.validation([
    {
      field: 'name',
      code: 'taken',
      message: 'This organisation already has a job role with this name',
    },
  ]);

@Injectable()
export class JobRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(CURSORS) private readonly cursors: Cursors,
  ) {}

  async list(ctx: RequestContext, input: ListInput): Promise<JobRoleListPage> {
    const tenantId = tenantOf(ctx);
    const { cursor, ...query } = input;
    const key = queryKey([
      'job-roles',
      tenantId,
      query.status ?? '',
      query.search ?? '',
      query.limit,
    ]);
    const position = cursor ? this.cursors.decode(cursor, key, 'string') : null;
    const rows = await this.prisma.jobRole.findMany({
      where: {
        AND: [
          { tenantId },
          query.status ? { status: query.status } : {},
          query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {},
          position ? afterCursor('name', 'asc', position.value, position.id) : {},
        ],
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      data: page.map(toJobRoleView),
      page: {
        limit: query.limit,
        nextCursor:
          rows.length > query.limit && last ? this.cursors.encode(last.name, last.id, key) : null,
      },
    };
  }

  async create(
    ctx: RequestContext,
    input: z.output<typeof CreateJobRoleBody>,
  ): Promise<JobRoleView> {
    const tenantId = tenantOf(ctx);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.jobRole.create({
          data: { tenantId, name: input.name, createdById: ctx.userId },
        });
        await this.audit.record(tx, {
          actorUserId: ctx.userId,
          tenantId,
          action: 'job_role.created',
          entityType: 'job_role',
          entityId: row.id,
          requestId: ctx.requestId,
          after: { name: row.name },
        });
        return row;
      });
      return toJobRoleView(created);
    } catch (err) {
      if (isUniqueViolation(err, 'job_roles_tenant_id_name_key')) throw nameTaken();
      throw err;
    }
  }

  async rename(
    ctx: RequestContext,
    id: string,
    input: z.output<typeof UpdateJobRoleBody>,
  ): Promise<JobRoleView> {
    const tenantId = tenantOf(ctx);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const current = await tx.jobRole.findFirst({ where: { id, tenantId } });
        if (!current) throw ApiException.notFound();
        if (current.version !== input.version) throw conflict();
        if (current.name === input.name) return current;
        const result = await tx.jobRole.updateMany({
          where: { id, tenantId, version: input.version },
          data: { name: input.name, version: { increment: 1 } },
        });
        if (result.count === 0) throw conflict();
        await this.audit.record(tx, {
          actorUserId: ctx.userId,
          tenantId,
          action: 'job_role.renamed',
          entityType: 'job_role',
          entityId: id,
          requestId: ctx.requestId,
          before: { name: current.name },
          after: { name: input.name },
        });
        return tx.jobRole.findFirstOrThrow({ where: { id, tenantId } });
      });
      return toJobRoleView(updated);
    } catch (err) {
      if (isUniqueViolation(err, 'job_roles_tenant_id_name_key')) throw nameTaken();
      throw err;
    }
  }

  async setActive(ctx: RequestContext, id: string, active: boolean, reason: string) {
    const tenantId = tenantOf(ctx);
    const updated = await this.prisma.$transaction(async (tx) => {
      // Same lock as member changes: a role being deactivated is never newly attached at the same moment.
      await lockTenant(tx, tenantId);
      const current = await tx.jobRole.findFirst({ where: { id, tenantId } });
      if (!current) throw ApiException.notFound();
      const result = await tx.jobRole.updateMany({
        where: { id, tenantId, status: active ? 'inactive' : 'active' },
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
        throw new ApiException(409, 'INVALID_STATE', `The job role is already ${current.status}`);
      }
      await this.audit.record(tx, {
        actorUserId: ctx.userId,
        tenantId,
        action: active ? 'job_role.reactivated' : 'job_role.deactivated',
        entityType: 'job_role',
        entityId: id,
        requestId: ctx.requestId,
        reason,
        before: { status: current.status },
        after: { status: active ? 'active' : 'inactive' },
      });
      return tx.jobRole.findFirstOrThrow({ where: { id, tenantId } });
    });
    return toJobRoleView(updated);
  }
}
