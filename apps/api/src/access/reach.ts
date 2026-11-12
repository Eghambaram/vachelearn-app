import type { Tx } from '../audit/audit.service';
import { ApiException } from '../common/errors/api-exception';
import {
  BRANCH_ADMIN_ASSIGNABLE,
  tenantGrants,
  type TenantPermission,
  type TenantRole,
} from './permissions';
import type { RequestContext } from './request-context';

/*
 * How far a tenant caller reaches for one permission: the whole tenant, or some branches. Shared by every service that
 * changes members (role assignment 2.4b, people 2.5a), so "who may act" is answered one way everywhere.
 */

export type Reach = { kind: 'tenant' } | { kind: 'branches'; branchIds: ReadonlySet<string> };

const LIVE = { revokedAt: null } as const;

/**
 * D-101 (and D-113 for roles): a branch-scoped caller acts only on members wholly inside its branches whose live roles
 * are all branch roles it could grant itself (Learner, Instructor) — never a peer Branch Admin, a Learning Manager or a
 * Compliance Viewer, and never a whole-organisation role holder (isolation + security reviews 2.5a, exit gate).
 */
export function withinReach(
  reach: Reach,
  member: {
    branches: readonly { branch: { id: string } }[];
    roleAssignments: readonly { role: TenantRole; branch: { id: string } | null }[];
  },
) {
  if (reach.kind === 'tenant') return true;
  return (
    member.branches.length > 0 &&
    member.branches.every((b) => reach.branchIds.has(b.branch.id)) &&
    member.roleAssignments.every(
      (a) => a.branch !== null && BRANCH_ADMIN_ASSIGNABLE.includes(a.role),
    )
  );
}

/** Reach from the context: the access guard already narrowed the branch scope to the route's permission. */
export function reachFromContext(ctx: RequestContext): Reach {
  const scope = ctx.tenant?.branchScope ?? [];
  return scope === 'ALL' ? { kind: 'tenant' } : { kind: 'branches', branchIds: new Set(scope) };
}

/**
 * Reach for a permission other than the route's (e.g. "may this reader also manage?"), from the context's grants;
 * null when the caller does not hold it. Test callers without grants: their fixture scope when they hold it.
 */
export function reachFor(ctx: RequestContext, permission: TenantPermission): Reach | null {
  const tenant = ctx.tenant;
  if (!tenant || !tenant.permissions.has(permission)) return null;
  if (!tenant.grants) return reachFromContext(ctx);
  const grant = tenant.grants.get(permission);
  if (grant?.kind === 'all') return { kind: 'tenant' };
  if (grant?.kind === 'branches' && grant.branchIds.size > 0) {
    return { kind: 'branches', branchIds: grant.branchIds };
  }
  return null;
}

/**
 * The caller's reach for `permission` as it is now, read inside the caller's transaction (after the tenant lock): their
 * own live roles (active membership and account, active branches). Revoked a moment ago → 403. Test callers (no
 * membership) keep their fixture scope.
 */
export async function liveReach(
  tx: Tx,
  ctx: RequestContext,
  tenantId: string,
  permission: TenantPermission,
): Promise<Reach> {
  // Support sessions are read-only (D-037): never a reach to change anything, whatever a route allows.
  if (ctx.support)
    throw new ApiException(403, 'SUPPORT_READ_ONLY', 'Support sessions are read-only');
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
      ).get(permission)
    : undefined;
  if (grant?.kind === 'all') return { kind: 'tenant' };
  if (grant?.kind === 'branches' && grant.branchIds.size > 0) {
    return { kind: 'branches', branchIds: grant.branchIds };
  }
  throw new ApiException(403, 'FORBIDDEN', 'Forbidden');
}
