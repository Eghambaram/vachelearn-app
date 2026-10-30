/*
 * The session contract the web app renders from. Phase 1 fills it from `mocks/demo-session.ts`; Phase 2 (slices 2.3
 * and 2.4) returns the same shape from `GET /api/v1/session`, computed by the API from the authenticated session and
 * memberships. The web app never derives tenant, role or permissions itself — it only displays what it is given.
 */

export const ROLE_KEYS = [
  'platform_super_admin',
  'tenant_admin',
  'branch_admin',
  'learning_manager',
  'compliance_viewer',
  'instructor',
  'learner',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

/** The four authenticated workspaces (route groups in `app/`). */
export type Workspace = 'platform' | 'admin' | 'instructor' | 'learn';

/** A tenant the user belongs to; `membershipId` is set for real sessions (switching uses it, D-089). */
export type TenantMembership = { tenantId: string; tenantName: string; membershipId?: string };

export type SessionView = {
  user: { id: string; displayName: string; email: string };
  /** The active role. Phase 2 may return several assignments; the UI then picks per workspace. */
  role: RoleKey;
  /** Human description of the role's scope, e.g. "Whole organisation" or "Example Branch A1". */
  scopeLabel: string;
  /**
   * Branches the role is limited to (Branch Admin, branch-scoped Learning Manager / Compliance Viewer), or null when
   * it covers the whole tenant. Display only: the API applies the same scope to every query (D-026).
   */
  branchScope: readonly { id: string; name: string }[] | null;
  /** Tenants the user belongs to. Empty for platform staff (they have no implicit tenant access, D-037). */
  memberships: readonly TenantMembership[];
  activeTenantId: string | null;
  /** Permission keys from docs/ROLE_PERMISSION_MATRIX.md. Used to shape navigation; the API re-checks every call. */
  permissions: readonly string[];
  /** True while the session comes from demo fixtures (Phase 1). */
  demo: boolean;
  /** The roles this user may switch between (D-096): real roles only; the demo uses its own role switcher. */
  availableRoles: readonly RoleKey[];
  /** Platform staff inside a support session (D-037): the tenant shown in the banner, until `expiresAt`. */
  support: { sessionId: string; tenantName: string; expiresAt: string } | null;
};

/** Which workspace a role works in. Demo simplification: one workspace per role until Phase 2 (D-026, D-053). */
export const ROLE_WORKSPACE: Record<RoleKey, Workspace> = {
  platform_super_admin: 'platform',
  tenant_admin: 'admin',
  branch_admin: 'admin',
  learning_manager: 'admin',
  compliance_viewer: 'admin',
  instructor: 'instructor',
  learner: 'learn',
};

export const WORKSPACE_HOME: Record<Workspace, string> = {
  platform: '/platform',
  admin: '/admin',
  instructor: '/instructor',
  learn: '/learn',
};

export function activeTenant(session: SessionView): TenantMembership | null {
  return session.memberships.find((m) => m.tenantId === session.activeTenantId) ?? null;
}
