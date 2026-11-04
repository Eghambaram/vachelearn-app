import { Inject, Injectable } from '@nestjs/common';
import type { AuditActor, AuditEventListPage, AuditEventListQuery } from '@vachelearn/contracts';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';
import { reachFor, reachFromContext, type Reach } from '../access/reach';
import type { RequestContext } from '../access/request-context';
import { ApiException } from '../common/errors/api-exception';
import { CURSORS, Cursors, queryKey } from '../common/pagination/keyset';
import { PrismaService } from '../prisma/prisma.service';

/*
 * The tenant audit log, read side (Slice 2.6a; D-099, D-109). The caller's tenant only; newest first by
 * (occurred_at, id). Branch-scoped readers see only events tagged with one of their branches — organisation-level
 * events are tenant-wide readers' (D-109, fail closed). Actors are named, never by email: support sessions as
 * "VacheLearn support" with the session's reason (D-099), other VacheLearn staff as staff, operator/job rows as system.
 * Isolation review 2.6a: "support" only when the actor is the session's own staff member (another caller ending a
 * support session is not named); deactivation reasons only for readers who may deactivate members (D-106); branch ids
 * outside a branch-scoped reader's reach are masked; rows written before 2.6a with another tenant's membership id in a
 * tenant switch show no before/after.
 */

/** Free-text reasons only readers who may deactivate members see (D-106). */
const DEACTIVATION_ACTIONS = new Set(['membership.deactivated', 'membership.reactivated']);
/** Events whose before/after may hold ids from another tenant (written before 2.6a). */
const NO_VALUES_ACTIONS = new Set(['auth.tenant_switched']);
const OTHER_BRANCH = '[other branch]';

type ListInput = z.output<typeof AuditEventListQuery>;

const SELECT = {
  id: true,
  occurredAt: true,
  action: true,
  entityType: true,
  entityId: true,
  reason: true,
  before: true,
  after: true,
  supportSessionId: true,
  branch: { select: { id: true, code: true, name: true } },
  actorUserId: true,
  actor: {
    // A live platform role only (a former staff member's own tenant actions read as a member's).
    select: {
      displayName: true,
      platformRoles: { where: { revokedAt: null }, select: { id: true }, take: 1 },
    },
  },
  supportSession: { select: { reason: true, staffUserId: true } },
} satisfies Prisma.AuditEventSelect;

type Row = Prisma.AuditEventGetPayload<{ select: typeof SELECT }>;

function actorOf(row: Row): AuditActor {
  if (!row.actor) return { kind: 'system' };
  // Only the session's own staff member is "VacheLearn support": anyone else ending it (a tenant admin deactivating a
  // membership, staff archiving a tenant) is not named to this tenant.
  if (row.supportSessionId) {
    if (row.actorUserId !== row.supportSession?.staffUserId) return { kind: 'system' };
    return {
      kind: 'support',
      displayName: row.actor.displayName,
      reason: row.supportSession?.reason ?? null,
    };
  }
  return row.actor.platformRoles.length > 0
    ? { kind: 'staff', displayName: row.actor.displayName }
    : { kind: 'user', displayName: row.actor.displayName };
}

const asRecord = (value: Prisma.JsonValue | null) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Branch ids outside a branch-scoped reader's reach are masked (e.g. a primary branch moved from another branch). */
function maskBranches(values: Record<string, unknown> | null, reach: Reach) {
  if (!values || reach.kind === 'tenant') return values;
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) =>
      /branchId$/i.test(key) && typeof value === 'string' && !reach.branchIds.has(value)
        ? [key, OTHER_BRANCH]
        : [key, value],
    ),
  );
}

@Injectable()
export class AuditLogService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CURSORS) private readonly cursors: Cursors,
  ) {}

  async list(ctx: RequestContext, input: ListInput): Promise<AuditEventListPage> {
    if (!ctx.tenant) throw ApiException.notFound();
    const tenantId = ctx.tenant.tenantId;
    const reach = reachFromContext(ctx);
    const { cursor, ...query } = input;
    if (reach.kind === 'branches' && reach.branchIds.size === 0) {
      return { data: [], page: { limit: query.limit, nextCursor: null } };
    }
    const key = queryKey([
      'audit-events',
      tenantId,
      reach.kind === 'tenant' ? 'ALL' : [...reach.branchIds].sort(),
      query.action ?? '',
      query.support ?? '',
      query.limit,
    ]);
    const position = cursor ? this.cursors.decode(cursor, key, 'instant') : null;
    const rows = await this.prisma.auditEvent.findMany({
      where: {
        AND: [
          { tenantId },
          // D-109: branch-scoped readers see branch-tagged events of their branches only.
          reach.kind === 'tenant' ? {} : { branchId: { in: [...reach.branchIds] } },
          query.action ? { action: query.action } : {},
          query.support === 'true'
            ? { supportSessionId: { not: null } }
            : query.support === 'false'
              ? { supportSessionId: null }
              : {},
          position
            ? {
                OR: [
                  { occurredAt: { lt: position.value } },
                  { occurredAt: position.value, id: { lt: position.id } },
                ],
              }
            : {},
        ],
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: SELECT,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const labels = await this.labels(tenantId, page);
    const seesReasons =
      !ctx.support &&
      (reachFor(ctx, 'user.deactivate') !== null || reachFor(ctx, 'user.reactivate') !== null);
    return {
      data: page.map((row) => ({
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        entityLabel: labels.get(`${row.entityType}:${row.entityId}`) ?? null,
        actor: actorOf(row),
        branch: row.branch,
        reason: DEACTIVATION_ACTIONS.has(row.action) && !seesReasons ? null : row.reason,
        before: NO_VALUES_ACTIONS.has(row.action)
          ? null
          : maskBranches(asRecord(row.before), reach),
        after: NO_VALUES_ACTIONS.has(row.action) ? null : maskBranches(asRecord(row.after), reach),
      })),
      page: {
        limit: query.limit,
        nextCursor:
          rows.length > query.limit && last
            ? this.cursors.encode(last.occurredAt.toISOString(), last.id, key)
            : null,
      },
    };
  }

  /**
   * Names for the page's records, read in this tenant only (every lookup carries `tenantId`): members by name, branches
   * and job roles by name, role assignments as "role · member", the tenant by its name. Batched per type.
   */
  private async labels(tenantId: string, rows: readonly Row[]) {
    const ids = (type: string) => [
      ...new Set(rows.filter((r) => r.entityType === type).map((r) => r.entityId)),
    ];
    const out = new Map<string, string>();
    const [members, branches, jobRoles, roles, tenant] = await Promise.all([
      this.prisma.membership.findMany({
        where: { tenantId, id: { in: ids('membership') } },
        select: { id: true, user: { select: { displayName: true } } },
      }),
      this.prisma.branch.findMany({
        where: { tenantId, id: { in: ids('branch') } },
        select: { id: true, name: true },
      }),
      this.prisma.jobRole.findMany({
        where: { tenantId, id: { in: ids('job_role') } },
        select: { id: true, name: true },
      }),
      this.prisma.roleAssignment.findMany({
        where: { tenantId, id: { in: ids('role_assignment') } },
        select: {
          id: true,
          role: true,
          membership: { select: { user: { select: { displayName: true } } } },
        },
      }),
      ids('tenant').includes(tenantId)
        ? this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { displayName: true } })
        : null,
    ]);
    for (const m of members) out.set(`membership:${m.id}`, m.user.displayName);
    for (const b of branches) out.set(`branch:${b.id}`, b.name);
    for (const j of jobRoles) out.set(`job_role:${j.id}`, j.name);
    // The role key is translated by the screen: "<role>·<member>".
    for (const r of roles)
      out.set(`role_assignment:${r.id}`, `${r.role}·${r.membership.user.displayName}`);
    if (tenant) out.set(`tenant:${tenantId}`, tenant.displayName);
    return out;
  }
}
