import type { Prisma } from '../../generated/prisma/client';
import type { Tx } from '../audit/audit.service';

/*
 * One definition of "a usable Tenant Admin" (D-095, Proposed), shared by the last-admin rule (D-091) and the first-admin
 * route (D-092): a live Tenant Admin assignment of an active member whose account is active and verified (has set a
 * password, D-083). An admin who never followed their set-password link — e.g. a mistyped address — does not count,
 * so platform staff can still set up a working admin.
 */
export const usableTenantAdmin = (tenantId: string): Prisma.RoleAssignmentWhereInput => ({
  tenantId,
  role: 'tenant_admin',
  revokedAt: null,
  membership: { status: 'active', user: { status: 'active', emailVerifiedAt: { not: null } } },
});

/** Serialises role and admin changes per tenant (assign, revoke, first admin): `SELECT … FOR UPDATE` on the tenant. */
export async function lockTenant(tx: Tx, tenantId: string) {
  const [row] = await tx.$queryRaw<{ status: string }[]>`
    SELECT status FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`;
  return row ?? null;
}

/** True when the account holds a live platform role: platform staff never become tenant members this way (D-095). */
export async function isPlatformStaff(tx: Tx, userId: string) {
  return (await tx.platformRoleAssignment.count({ where: { userId, revokedAt: null } })) > 0;
}
