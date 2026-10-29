import { Injectable } from '@nestjs/common';
import type { RoleAssignmentView } from '@vachelearn/contracts';
import type { TenantRole as DbTenantRole } from '../../generated/prisma/client';
import { AuditService, type Tx } from '../audit/audit.service';
import { ApiException } from '../common/errors/api-exception';
import { isUniqueViolation } from '../prisma/errors';
import { PrismaService } from '../prisma/prisma.service';
import { BRANCH_ONLY_ROLES, TENANT_ONLY_ROLES, tenantGrants, type TenantRole } from './permissions';
import type { RequestContext } from './request-context';
import { isPlatformStaff, lockTenant, usableTenantAdmin } from './tenant-admins';

/*
 * Role assignment by tenant members (Slice 2.4b; matrix "Granting rules"; D-053, D-091–D-095). The actor's reach is
 * their `role.assign` grant:
 * - whole tenant (Tenant Admin): any tenant role, tenant-wide or on any active branch; may add the member to the branch
 *   in the same request (D-093); may manage other Tenant Admins (D-094);
 * - some branches (Branch Admin): only Learner and Instructor (matrix `B (LRN, INS only)`), only on those branches, only
 *   for members already in one of them (D-093).
 * Every change runs under the tenant row lock and re-reads the actor's own live roles there, so an actor revoked a
 * moment ago cannot finish an in-flight change (isolation audit 2.4b). Nobody changes their own assignments; the last
 * usable Tenant Admin cannot be revoked (D-091, D-095); platform staff accounts get no tenant roles (D-095).
 * Out-of-reach memberships, branches and assignments are 404, never 403. Every change is audited.
 */

const BRANCH_ADMIN_ASSIGNABLE: readonly TenantRole[] = ['learner', 'instructor'];
const LIVE = { revokedAt: null } as const;

type Reach = { kind: 'tenant' } | { kind: 'branches'; branchIds: ReadonlySet<string> };

const VIEW_SELECT = {
  id: true,
  membershipId: true,
  role: true,
  createdAt: true,
  branch: { select: { id: true, code: true, name: true } },
} as const;

type ViewRow = {
  id: string;
  membershipId: string;
  role: DbTenantRole;
  createdAt: Date;
  branch: { id: string; code: string; name: string } | null;
};

const toView = (a: ViewRow): RoleAssignmentView => ({
  id: a.id,
  membershipId: a.membershipId,
  role: a.role,
  createdAt: a.createdAt.toISOString(),
  branch: a.branch,
});

const forbidden = (message = 'Forbidden') => new ApiException(403, 'FORBIDDEN', message);
const selfChange = () => new ApiException(403, 'SELF_CHANGE', 'You cannot change your own roles');

@Injectable()
export class RoleAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** One member's live assignments, as far as the caller reaches. */
  async list(ctx: RequestContext, membershipId: string): Promise<RoleAssignmentView[]> {
    const tenantId = tenantOf(ctx);
    const reach = reachFromContext(ctx);
    await this.visibleMembership(this.prisma, tenantId, reach, membershipId);
    const rows = await this.prisma.roleAssignment.findMany({
      where: {
        tenantId,
        membershipId,
        ...LIVE,
        // A Branch Admin sees the assignments on its own branches only.
        ...(reach.kind === 'branches' ? { branchId: { in: [...reach.branchIds] } } : {}),
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: VIEW_SELECT,
    });
    return rows.map(toView);
  }

  async assign(
    ctx: RequestContext,
    input: { membershipId: string; role: TenantRole; branchId: string | null },
  ): Promise<RoleAssignmentView> {
    const tenantId = tenantOf(ctx);
    // Checks that depend on the request body only (they reveal nothing stored).
    if (BRANCH_ONLY_ROLES.includes(input.role) && !input.branchId) {
      throw ApiException.validation([
        { field: 'branchId', code: 'required', message: 'A Branch Admin needs a branch' },
      ]);
    }
    if (TENANT_ONLY_ROLES.includes(input.role) && input.branchId) {
      throw ApiException.validation([
        {
          field: 'branchId',
          code: 'not_allowed',
          message: 'A Tenant Admin is for the whole tenant',
        },
      ]);
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockTenant(tx, tenantId);
        const reach = await this.currentReach(tx, ctx, tenantId);
        if (reach.kind === 'branches') {
          if (!BRANCH_ADMIN_ASSIGNABLE.includes(input.role)) {
            throw forbidden('A Branch Admin can assign only Learner or Instructor');
          }
          if (!input.branchId) {
            throw ApiException.validation([
              { field: 'branchId', code: 'required', message: 'Choose one of your branches' },
            ]);
          }
          if (!reach.branchIds.has(input.branchId)) throw ApiException.notFound();
        }
        const membership = await this.visibleMembership(tx, tenantId, reach, input.membershipId);
        if (membership.userId === ctx.userId) throw selfChange();
        if (membership.userStatus !== 'active' || (await isPlatformStaff(tx, membership.userId))) {
          throw new ApiException(409, 'INVALID_STATE', 'This account cannot be given a role here');
        }
        if (input.branchId) {
          const branch = await tx.branch.findFirst({
            where: { id: input.branchId, tenantId, status: 'active' },
            select: { id: true },
          });
          if (!branch) throw ApiException.notFound();
          const inBranch = await tx.membershipBranch.findUnique({
            where: {
              membershipId_branchId: { membershipId: membership.id, branchId: input.branchId },
            },
            select: { branchId: true },
          });
          if (!inBranch) {
            if (reach.kind === 'branches') {
              throw ApiException.validation([
                {
                  field: 'branchId',
                  code: 'not_in_branch',
                  message: 'The member does not belong to this branch',
                },
              ]);
            }
            await this.addBranch(tx, ctx, tenantId, membership.id, input.branchId);
          }
        }
        const created = await tx.roleAssignment.create({
          data: {
            tenantId,
            membershipId: membership.id,
            role: input.role as DbTenantRole,
            branchId: input.branchId,
            createdById: ctx.userId,
          },
          select: VIEW_SELECT,
        });
        await this.audit.record(tx, {
          actorUserId: ctx.userId,
          tenantId,
          branchId: input.branchId,
          action: 'role.assigned',
          entityType: 'role_assignment',
          entityId: created.id,
          requestId: ctx.requestId,
          after: { role: input.role, branchId: input.branchId, membershipId: membership.id },
        });
        return toView(created);
      });
    } catch (err) {
      // The same assignment created concurrently: one wins, the other is told so (never a 500).
      if (isUniqueViolation(err, 'role_assignments_one_live')) {
        throw new ApiException(409, 'ALREADY_ASSIGNED', 'The member already has this role here');
      }
      throw err;
    }
  }

  async revoke(ctx: RequestContext, id: string, reason: string): Promise<RoleAssignmentView> {
    const tenantId = tenantOf(ctx);
    return this.prisma.$transaction(async (tx) => {
      // Serialise role changes per tenant, so two concurrent revocations cannot both pass the last-admin check.
      await lockTenant(tx, tenantId);
      const reach = await this.currentReach(tx, ctx, tenantId);
      const assignment = await tx.roleAssignment.findFirst({
        where: {
          id,
          tenantId,
          ...LIVE,
          ...(reach.kind === 'branches' ? { branchId: { in: [...reach.branchIds] } } : {}),
        },
        select: { ...VIEW_SELECT, membership: { select: { userId: true } } },
      });
      if (!assignment) throw ApiException.notFound();
      if (reach.kind === 'branches' && !BRANCH_ADMIN_ASSIGNABLE.includes(assignment.role)) {
        throw forbidden('A Branch Admin can revoke only Learner or Instructor');
      }
      if (assignment.membership.userId === ctx.userId) throw selfChange();
      if (assignment.role === 'tenant_admin') {
        const others = await tx.roleAssignment.count({
          where: { ...usableTenantAdmin(tenantId), id: { not: assignment.id } },
        });
        if (others === 0) {
          throw new ApiException(
            409,
            'LAST_TENANT_ADMIN',
            'An organisation needs at least one Tenant Admin',
          );
        }
      }
      await tx.roleAssignment.update({
        where: { id: assignment.id },
        data: { revokedAt: new Date(), revokedById: ctx.userId, revokedReason: reason },
      });
      const branchId = assignment.branch?.id ?? null;
      await this.audit.record(tx, {
        actorUserId: ctx.userId,
        tenantId,
        branchId,
        action: 'role.revoked',
        entityType: 'role_assignment',
        entityId: assignment.id,
        requestId: ctx.requestId,
        reason,
        before: { role: assignment.role, branchId, membershipId: assignment.membershipId },
      });
      return toView(assignment);
    });
  }

  /**
   * The actor's `role.assign` reach as it is now, read under the tenant lock: their own live roles (active membership
   * and account, active branches). Revoked a moment ago → 403. Test callers (no membership) keep their fixture scope.
   */
  private async currentReach(tx: Tx, ctx: RequestContext, tenantId: string): Promise<Reach> {
    const membershipId = ctx.tenant?.membershipId;
    if (!membershipId) return reachFromContext(ctx);
    const actor = await tx.membership.findFirst({
      where: {
        id: membershipId,
        tenantId,
        userId: ctx.userId,
        status: 'active',
        user: { status: 'active' },
      },
      select: {
        roleAssignments: {
          where: { ...LIVE, OR: [{ branchId: null }, { branch: { status: 'active' } }] },
          select: { role: true, branchId: true },
        },
      },
    });
    const grant = actor
      ? tenantGrants(
          actor.roleAssignments.map((a) => ({ role: a.role as TenantRole, branchId: a.branchId })),
        ).get('role.assign')
      : undefined;
    if (grant?.kind === 'all') return { kind: 'tenant' };
    if (grant?.kind === 'branches' && grant.branchIds.size > 0) {
      return { kind: 'branches', branchIds: grant.branchIds };
    }
    throw forbidden();
  }

  /** An active membership of the tenant that the actor may manage: any (tenant reach) or one in its branches. */
  private async visibleMembership(tx: Tx, tenantId: string, reach: Reach, membershipId: string) {
    const membership = await tx.membership.findFirst({
      where: {
        id: membershipId,
        tenantId,
        status: 'active',
        ...(reach.kind === 'branches'
          ? { branches: { some: { branchId: { in: [...reach.branchIds] } } } }
          : {}),
      },
      select: { id: true, userId: true, user: { select: { status: true } } },
    });
    if (!membership) throw ApiException.notFound();
    return { id: membership.id, userId: membership.userId, userStatus: membership.user.status };
  }

  private async addBranch(
    tx: Tx,
    ctx: RequestContext,
    tenantId: string,
    membershipId: string,
    branchId: string,
  ) {
    // Idempotent under concurrency: a parallel request that added it first wins, and nothing is audited twice.
    const { count } = await tx.membershipBranch.createMany({
      data: [{ tenantId, membershipId, branchId, createdById: ctx.userId }],
      skipDuplicates: true,
    });
    if (count === 1) {
      await this.audit.record(tx, {
        actorUserId: ctx.userId,
        tenantId,
        branchId,
        action: 'membership.branch_added',
        entityType: 'membership',
        entityId: membershipId,
        requestId: ctx.requestId,
      });
    }
    const primary = await tx.membership.updateMany({
      where: { id: membershipId, primaryBranchId: null },
      data: { primaryBranchId: branchId },
    });
    if (primary.count === 1) {
      await this.audit.record(tx, {
        actorUserId: ctx.userId,
        tenantId,
        branchId,
        action: 'membership.primary_branch_set',
        entityType: 'membership',
        entityId: membershipId,
        requestId: ctx.requestId,
      });
    }
  }
}

function tenantOf(ctx: RequestContext) {
  if (!ctx.tenant) throw ApiException.notFound();
  return ctx.tenant.tenantId;
}

/** Reach from the context: the access guard already narrowed the branch scope to `role.assign`. */
function reachFromContext(ctx: RequestContext): Reach {
  const scope = ctx.tenant?.branchScope ?? [];
  return scope === 'ALL' ? { kind: 'tenant' } : { kind: 'branches', branchIds: new Set(scope) };
}
