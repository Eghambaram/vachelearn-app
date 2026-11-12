import { Inject, Injectable } from '@nestjs/common';
import type {
  PeopleListPage,
  PeopleListQuery,
  PersonSummary,
  PersonView,
  UpdatePersonBody,
} from '@vachelearn/contracts';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';
import { liveReach, reachFor, reachFromContext, withinReach, type Reach } from '../access/reach';
import type { RequestContext } from '../access/request-context';
import { SupportSessionsService } from '../access/support-sessions.service';
import { lockTenant, usableTenantAdmin } from '../access/tenant-admins';
import { AuditService, changedFields, type Tx } from '../audit/audit.service';
import { ApiException } from '../common/errors/api-exception';
import { CURSORS, Cursors, invalidCursor, queryKey } from '../common/pagination/keyset';
import { isUniqueViolation } from '../prisma/errors';
import { PrismaService } from '../prisma/prisma.service';
import { conflict } from '../tenancy/tenants.service';

/*
 * People basics (Slice 2.5a; D-026, D-047, D-101–D-105). Members of the caller's tenant, named by membership id.
 * - Reading (`user.read`): tenant-wide callers see everyone; branch-scoped callers see members who share one of their
 *   branches, and only those branches and the roles on them; the primary marker only tenant-wide (D-026). The branch
 *   filter narrows the scope, never widens it. Out-of-reach members are 404.
 * - Changing (`user.update`, `user.deactivate`, `user.reactivate`, `membership.branch.manage`): the caller's live reach
 *   re-read inside the transaction, under the tenant row lock (the same lock as role assignment, so the last-admin and
 *   live-role checks cannot race). A branch-scoped caller acts only on members whose branches all lie within its own and
 *   whose live roles are all ones it may grant itself — Learner or Instructor on a branch (D-101 + review amendment).
 *   Nobody changes their own membership. Every change is audited.
 * - Cursors carry ids only for name and email sorts: the sort value is read back from the anchor row (in this tenant),
 *   so no name or email ever sits in a URL (security review 2.5a; keyset rule).
 */

type ListInput = z.output<typeof PeopleListQuery>;
type UpdateInput = z.output<typeof UpdatePersonBody>;

const LIVE = { revokedAt: null } as const;

const PERSON_SELECT = {
  id: true,
  userId: true,
  status: true,
  employeeId: true,
  department: true,
  primaryBranchId: true,
  deactivatedAt: true,
  deactivatedReason: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { displayName: true, email: true, status: true, emailVerifiedAt: true } },
  jobRole: { select: { id: true, name: true, status: true } },
  branches: {
    orderBy: { branch: { code: 'asc' } },
    select: { branch: { select: { id: true, code: true, name: true } } },
  },
  roleAssignments: {
    where: LIVE,
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    select: { role: true, branch: { select: { id: true, code: true, name: true } } },
  },
} satisfies Prisma.MembershipSelect;

type PersonRow = Prisma.MembershipGetPayload<{ select: typeof PERSON_SELECT }>;

const forbidden = (code: string, message: string) => new ApiException(403, code, message);
const selfChange = () =>
  forbidden('SELF_CHANGE', 'You cannot change your own membership in this organisation');
const outsideScope = () =>
  forbidden(
    'OUTSIDE_BRANCH_SCOPE',
    'This person also belongs to branches you do not manage, or holds a role you cannot grant. Ask a Tenant Admin.',
  );

function tenantOf(ctx: RequestContext) {
  if (!ctx.tenant) throw ApiException.notFound();
  return ctx.tenant.tenantId;
}

/** `where` for the members a reach can see (D-026: any shared branch). */
function visibleWhere(tenantId: string, reach: Reach): Prisma.MembershipWhereInput {
  return reach.kind === 'tenant'
    ? { tenantId }
    : { tenantId, branches: { some: { branchId: { in: [...reach.branchIds] } } } };
}

function toSummary(row: PersonRow, reach: Reach): PersonSummary {
  const sees = (branchId: string) => reach.kind === 'tenant' || reach.branchIds.has(branchId);
  return {
    membershipId: row.id,
    displayName: row.user.displayName,
    email: row.user.email,
    status: row.status,
    employeeId: row.employeeId,
    department: row.department,
    jobRole: row.jobRole,
    branches: row.branches
      .filter((b) => sees(b.branch.id))
      .map((b) =>
        reach.kind === 'tenant'
          ? { ...b.branch, primary: b.branch.id === row.primaryBranchId }
          : b.branch,
      ),
    roles: row.roleAssignments.filter((a) => a.branch === null || sees(a.branch.id)),
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(CURSORS) private readonly cursors: Cursors,
    private readonly support: SupportSessionsService,
  ) {}

  async list(ctx: RequestContext, input: ListInput): Promise<PeopleListPage> {
    const tenantId = tenantOf(ctx);
    const reach = reachFromContext(ctx);
    const { cursor, ...query } = input;
    const empty = { data: [], page: { limit: query.limit, nextCursor: null } };
    // No branches to read (e.g. an Instructor before Phase 4 assigns learners), or a branch filter outside the scope:
    // nobody — the filter never widens what the caller sees.
    if (reach.kind === 'branches') {
      if (reach.branchIds.size === 0) return empty;
      if (query.branchId && !reach.branchIds.has(query.branchId)) {
        if (cursor) throw invalidCursor();
        return empty;
      }
    }
    // The scope is part of the key: a cursor never carries over to another tenant, scope or filter.
    const key = queryKey([
      'people',
      tenantId,
      reach.kind === 'tenant' ? 'ALL' : [...reach.branchIds].sort(),
      query.status ?? '',
      query.branchId ?? '',
      query.jobRoleId ?? '',
      query.search ?? '',
      query.sort,
      query.direction,
      query.limit,
    ]);
    const position = cursor ? await this.position(tenantId, cursor, key, query.sort) : null;

    const op = query.direction === 'asc' ? 'gt' : 'lt';
    const field = query.sort === 'name' ? 'displayName' : 'email';
    const after: Prisma.MembershipWhereInput = !position
      ? {}
      : query.sort === 'createdAt'
        ? {
            OR: [
              { createdAt: { [op]: position.value } },
              { createdAt: position.value, id: { [op]: position.id } },
            ],
          }
        : {
            OR: [
              { user: { [field]: { [op]: position.value } } },
              { user: { [field]: position.value }, id: { [op]: position.id } },
            ],
          };
    const orderBy: Prisma.MembershipOrderByWithRelationInput[] =
      query.sort === 'createdAt'
        ? [{ createdAt: query.direction }, { id: query.direction }]
        : [{ user: { [field]: query.direction } }, { id: query.direction }];

    const rows = await this.prisma.membership.findMany({
      where: {
        AND: [
          visibleWhere(tenantId, reach),
          query.branchId ? { branches: { some: { branchId: query.branchId } } } : {},
          query.status ? { status: query.status } : {},
          query.jobRoleId ? { jobRoleId: query.jobRoleId } : {},
          query.search
            ? {
                OR: [
                  { user: { displayName: { contains: query.search, mode: 'insensitive' } } },
                  { user: { email: { contains: query.search, mode: 'insensitive' } } },
                  { employeeId: { contains: query.search, mode: 'insensitive' } },
                ],
              }
            : {},
          after,
        ],
      },
      orderBy,
      take: query.limit + 1,
      select: PERSON_SELECT,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    // Names and emails never go into a cursor: the anchor row's id is enough (see `position`).
    const lastValue = (r: PersonRow) =>
      query.sort === 'createdAt' ? r.createdAt.toISOString() : '';
    return {
      data: page.map((r) => toSummary(r, reach)),
      page: {
        limit: query.limit,
        nextCursor:
          rows.length > query.limit && last
            ? this.cursors.encode(lastValue(last), last.id, key)
            : null,
      },
    };
  }

  /** Where a cursor points: for name/email sorts the value is read back from the anchor membership in this tenant. */
  private async position(
    tenantId: string,
    cursor: string,
    key: string,
    sort: ListInput['sort'],
  ): Promise<{ value: string | Date; id: string }> {
    const decoded = this.cursors.decode(cursor, key, sort === 'createdAt' ? 'instant' : 'string');
    if (sort === 'createdAt') return decoded;
    const anchor = await this.prisma.membership.findFirst({
      where: { id: decoded.id, tenantId },
      select: { user: { select: { displayName: true, email: true } } },
    });
    if (!anchor) throw invalidCursor();
    return { value: sort === 'name' ? anchor.user.displayName : anchor.user.email, id: decoded.id };
  }

  async get(ctx: RequestContext, id: string): Promise<PersonView> {
    const tenantId = tenantOf(ctx);
    const reach = reachFromContext(ctx);
    if (reach.kind === 'branches' && reach.branchIds.size === 0) throw ApiException.notFound();
    const row = await this.prisma.membership.findFirst({
      where: { id, ...visibleWhere(tenantId, reach) },
      select: PERSON_SELECT,
    });
    if (!row) throw ApiException.notFound();
    return this.toView(ctx, row, reach);
  }

  async update(ctx: RequestContext, id: string, input: UpdateInput): Promise<PersonView> {
    const tenantId = tenantOf(ctx);
    const { version, ...patch } = input;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockTenant(tx, tenantId);
        const { row, reach } = await this.manageable(tx, ctx, tenantId, id, 'user.update');
        if (row.version !== version) throw conflict();
        // A job role is chosen from this tenant's active list; another tenant's id is "unknown", never linked.
        if (patch.jobRoleId && patch.jobRoleId !== row.jobRole?.id) {
          const jobRole = await tx.jobRole.findFirst({
            where: { id: patch.jobRoleId, tenantId, status: 'active' },
            select: { id: true },
          });
          if (!jobRole) {
            throw ApiException.validation([
              {
                field: 'jobRoleId',
                code: 'unknown',
                message: 'Choose an active job role of this organisation',
              },
            ]);
          }
        }
        const before = {
          employeeId: row.employeeId,
          department: row.department,
          jobRoleId: row.jobRole?.id ?? null,
        };
        const diff = changedFields(before, patch, { personal: ['employeeId'] });
        const result = await tx.membership.updateMany({
          where: { id, tenantId, version },
          data: { ...patch, version: { increment: 1 } },
        });
        if (result.count === 0) throw conflict();
        if (diff.changed) {
          await this.audit.record(tx, {
            actorUserId: ctx.userId,
            tenantId,
            action: 'membership.updated',
            entityType: 'membership',
            entityId: id,
            requestId: ctx.requestId,
            before: diff.before,
            after: diff.after,
          });
        }
        return this.toView(ctx, await this.reload(tx, tenantId, id), readReach(ctx, reach));
      });
    } catch (err) {
      if (isUniqueViolation(err, 'memberships_tenant_id_employee_id_key')) {
        throw ApiException.validation([
          {
            field: 'employeeId',
            code: 'taken',
            message: 'Another member of this organisation has this employee ID',
          },
        ]);
      }
      throw err;
    }
  }

  /**
   * Deactivate or reactivate a membership (D-102): only this organisation's membership; its browser sessions in this
   * organisation end at once; role assignments stay recorded and grant nothing while inactive. The last usable Tenant
   * Admin cannot be deactivated (D-091, D-095).
   */
  async setActive(
    ctx: RequestContext,
    id: string,
    active: boolean,
    reason: string,
  ): Promise<PersonView> {
    const tenantId = tenantOf(ctx);
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      const { row, reach } = await this.manageable(
        tx,
        ctx,
        tenantId,
        id,
        active ? 'user.reactivate' : 'user.deactivate',
      );
      const from = active ? 'deactivated' : 'active';
      if (row.status !== from) {
        throw new ApiException(409, 'INVALID_STATE', `The member is already ${row.status}`);
      }
      if (!active && row.roleAssignments.some((a) => a.role === 'tenant_admin')) {
        const others = await tx.roleAssignment.count({
          where: { ...usableTenantAdmin(tenantId), membershipId: { not: id } },
        });
        if (others === 0) {
          throw new ApiException(
            409,
            'LAST_TENANT_ADMIN',
            'An organisation needs at least one Tenant Admin',
          );
        }
      }
      const now = new Date();
      await tx.membership.updateMany({
        where: { id, tenantId },
        data: active
          ? {
              status: 'active',
              deactivatedAt: null,
              deactivatedReason: null,
              deactivatedById: null,
              version: { increment: 1 },
            }
          : {
              status: 'deactivated',
              deactivatedAt: now,
              deactivatedReason: reason,
              deactivatedById: ctx.userId,
              version: { increment: 1 },
            },
      });
      // Sessions working in this organisation end now (D-102), and any support session bound to one of them (operator
      // paths can give staff a membership; isolation review 2.5a).
      let sessionsEnded = 0;
      if (!active) {
        const sessions = await tx.authSession.findMany({
          where: { activeMembershipId: id, endedAt: null },
          select: { id: true },
        });
        if (sessions.length > 0) {
          await tx.authSession.updateMany({
            where: { id: { in: sessions.map((x) => x.id) }, endedAt: null },
            data: { endedAt: now, endReason: 'membership_deactivated' },
          });
          for (const session of sessions) {
            await this.support.endForAuthSessions(
              tx,
              { authSessionId: session.id },
              { userId: ctx.userId, requestId: ctx.requestId },
            );
          }
        }
        sessionsEnded = sessions.length;
      }
      await this.audit.record(tx, {
        actorUserId: ctx.userId,
        tenantId,
        action: active ? 'membership.reactivated' : 'membership.deactivated',
        entityType: 'membership',
        entityId: id,
        requestId: ctx.requestId,
        reason,
        before: { status: row.status },
        after: active ? { status: 'active' } : { status: 'deactivated', sessionsEnded },
      });
      return this.toView(ctx, await this.reload(tx, tenantId, id), readReach(ctx, reach));
    });
  }

  /** Adds a branch to the member (D-026); the first branch becomes the primary one. Already there: unchanged. */
  async addBranch(ctx: RequestContext, id: string, branchId: string): Promise<PersonView> {
    const tenantId = tenantOf(ctx);
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      const { row, reach } = await this.manageable(
        tx,
        ctx,
        tenantId,
        id,
        'membership.branch.manage',
      );
      if (row.status !== 'active') {
        throw new ApiException(409, 'INVALID_STATE', 'Reactivate the member first');
      }
      await this.branchInReach(tx, tenantId, reach, branchId, { activeOnly: true });
      const { count } = await tx.membershipBranch.createMany({
        data: [{ tenantId, membershipId: id, branchId, createdById: ctx.userId }],
        skipDuplicates: true,
      });
      if (count === 1) {
        await this.audit.record(tx, {
          actorUserId: ctx.userId,
          tenantId,
          branchId,
          action: 'membership.branch_added',
          entityType: 'membership',
          entityId: id,
          requestId: ctx.requestId,
        });
        const primary = await tx.membership.updateMany({
          where: { id, tenantId, primaryBranchId: null },
          data: { primaryBranchId: branchId },
        });
        if (primary.count === 1) await this.auditPrimary(tx, ctx, tenantId, id, branchId, null);
        await tx.membership.updateMany({
          where: { id, tenantId },
          data: { version: { increment: 1 } },
        });
      }
      return this.toView(ctx, await this.reload(tx, tenantId, id), readReach(ctx, reach));
    });
  }

  /**
   * Removes a branch from the member (D-104): refused while they hold a live role on it; the primary branch only as the
   * last branch (otherwise make another primary first). The caller may no longer see the member afterwards: 204.
   */
  async removeBranch(ctx: RequestContext, id: string, branchId: string): Promise<void> {
    const tenantId = tenantOf(ctx);
    await this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      const { row, reach } = await this.manageable(
        tx,
        ctx,
        tenantId,
        id,
        'membership.branch.manage',
      );
      await this.branchInReach(tx, tenantId, reach, branchId, { activeOnly: false });
      if (!row.branches.some((b) => b.branch.id === branchId)) throw ApiException.notFound();
      if (row.primaryBranchId === branchId && row.branches.length > 1) {
        throw new ApiException(409, 'PRIMARY_BRANCH', 'Make another branch primary first');
      }
      const liveRole = await tx.roleAssignment.count({
        where: { tenantId, membershipId: id, branchId, ...LIVE },
      });
      if (liveRole > 0) {
        throw new ApiException(
          409,
          'BRANCH_HAS_ROLE',
          'Revoke the member’s roles on this branch first',
        );
      }
      if (row.primaryBranchId === branchId) {
        await tx.membership.updateMany({
          where: { id, tenantId },
          data: { primaryBranchId: null },
        });
        await this.auditPrimary(tx, ctx, tenantId, id, null, branchId);
      }
      await tx.membershipBranch.deleteMany({ where: { tenantId, membershipId: id, branchId } });
      await tx.membership.updateMany({
        where: { id, tenantId },
        data: { version: { increment: 1 } },
      });
      await this.audit.record(tx, {
        actorUserId: ctx.userId,
        tenantId,
        branchId,
        action: 'membership.branch_removed',
        entityType: 'membership',
        entityId: id,
        requestId: ctx.requestId,
      });
    });
  }

  /** Makes one of the member's branches primary (D-026: reports group by it). */
  async setPrimaryBranch(ctx: RequestContext, id: string, branchId: string): Promise<PersonView> {
    const tenantId = tenantOf(ctx);
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      const { row, reach } = await this.manageable(
        tx,
        ctx,
        tenantId,
        id,
        'membership.branch.manage',
      );
      await this.branchInReach(tx, tenantId, reach, branchId, { activeOnly: true });
      if (!row.branches.some((b) => b.branch.id === branchId)) {
        throw ApiException.validation([
          {
            field: 'branchId',
            code: 'not_in_branch',
            message: 'The member does not belong to this branch',
          },
        ]);
      }
      if (row.primaryBranchId !== branchId) {
        await tx.membership.updateMany({
          where: { id, tenantId },
          data: { primaryBranchId: branchId, version: { increment: 1 } },
        });
        await this.auditPrimary(tx, ctx, tenantId, id, branchId, row.primaryBranchId);
      }
      return this.toView(ctx, await this.reload(tx, tenantId, id), readReach(ctx, reach));
    });
  }

  // ── helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * The member, if the caller may change it now: visible to the caller's live reach for `permission` (else 404), not
   * the caller (403 SELF_CHANGE), and within reach under D-101 (else 403 OUTSIDE_BRANCH_SCOPE).
   */
  private async manageable(
    tx: Tx,
    ctx: RequestContext,
    tenantId: string,
    id: string,
    permission: 'user.update' | 'user.deactivate' | 'user.reactivate' | 'membership.branch.manage',
  ) {
    const reach = await liveReach(tx, ctx, tenantId, permission);
    const row = await tx.membership.findFirst({
      where: { id, ...visibleWhere(tenantId, reach) },
      select: PERSON_SELECT,
    });
    if (!row) throw ApiException.notFound();
    if (row.userId === ctx.userId) throw selfChange();
    if (!withinReach(reach, row)) throw outsideScope();
    return { row, reach };
  }

  /** A branch of the tenant the caller reaches (out of reach or another tenant's: 404). */
  private async branchInReach(
    tx: Tx,
    tenantId: string,
    reach: Reach,
    branchId: string,
    { activeOnly }: { activeOnly: boolean },
  ) {
    if (reach.kind === 'branches' && !reach.branchIds.has(branchId)) throw ApiException.notFound();
    const branch = await tx.branch.findFirst({
      where: { id: branchId, tenantId, ...(activeOnly ? { status: 'active' as const } : {}) },
      select: { id: true },
    });
    if (!branch) throw ApiException.notFound();
  }

  private auditPrimary(
    tx: Tx,
    ctx: RequestContext,
    tenantId: string,
    id: string,
    to: string | null,
    from: string | null,
  ) {
    return this.audit.record(tx, {
      actorUserId: ctx.userId,
      tenantId,
      branchId: to ?? from,
      action: 'membership.primary_branch_set',
      entityType: 'membership',
      entityId: id,
      requestId: ctx.requestId,
      before: { primaryBranchId: from },
      after: { primaryBranchId: to },
    });
  }

  private reload(tx: Tx, tenantId: string, id: string) {
    return tx.membership.findFirstOrThrow({ where: { id, tenantId }, select: PERSON_SELECT });
  }

  /** The detail view; `canManage` answers "may this caller change this member" for the screen (D-101). */
  private toView(ctx: RequestContext, row: PersonRow, readReach: Reach): PersonView {
    const manage = ctx.support ? null : reachFor(ctx, 'user.update');
    const lifecycle = ctx.support
      ? null
      : (reachFor(ctx, 'user.deactivate') ?? reachFor(ctx, 'user.reactivate'));
    const summary = toSummary(row, readReach);
    // A branch-scoped caller who manages this member's branches sees the primary marker too: under D-101 all the
    // member's branches lie within its own, so the marker reveals nothing outside its scope (UX review 2.5b) — and it
    // can then act on "make another branch primary first".
    const branchManage = ctx.support ? null : reachFor(ctx, 'membership.branch.manage');
    if (
      readReach.kind === 'branches' &&
      branchManage !== null &&
      row.userId !== ctx.userId &&
      withinReach(branchManage, row)
    ) {
      summary.branches = row.branches.map((b) => ({
        ...b.branch,
        primary: b.branch.id === row.primaryBranchId,
      }));
    }
    return {
      ...summary,
      accountStatus: row.user.status,
      accountVerified: row.user.emailVerifiedAt !== null,
      deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
      // Free text that may be sensitive: only for callers who may deactivate or reactivate *this* member (D-106: a
      // Branch Admin within D-101 reach) — the audit log hides it the same way (exit-gate isolation audit).
      deactivatedReason:
        lifecycle !== null && withinReach(lifecycle, row) ? row.deactivatedReason : null,
      canManage:
        manage !== null &&
        row.userId !== ctx.userId &&
        visibleTo(manage, row) &&
        withinReach(manage, row),
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

/** What the caller reads in the answer to a change: its `user.read` reach (the change's reach if it has none). */
function readReach(ctx: RequestContext, fallback: Reach): Reach {
  return reachFor(ctx, 'user.read') ?? fallback;
}

function visibleTo(reach: Reach, row: PersonRow) {
  return reach.kind === 'tenant' || row.branches.some((b) => reach.branchIds.has(b.branch.id));
}
