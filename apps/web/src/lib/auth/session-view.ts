import type { SessionContextView } from '@vachelearn/contracts';
import { ROLE_KEYS, type RoleKey, type SessionView } from '@/lib/api/session-types';
import { NAV, type NavItem } from '@/lib/nav';

/*
 * The API's session (`GET /auth/session`) → the shell's `SessionView` (Slice 2.4d). Pure: no fetching, no cookies, so
 * it is unit-tested. The web never derives permissions or scope — it only chooses which of the user's real roles to
 * show (D-096) and labels it; the API checks every action.
 */

/** Most capable first (D-096). */
export const ROLE_RANK: readonly RoleKey[] = [
  'platform_super_admin',
  'tenant_admin',
  'branch_admin',
  'learning_manager',
  'compliance_viewer',
  'instructor',
  'learner',
];

export function isRoleKey(value: unknown): value is RoleKey {
  return typeof value === 'string' && (ROLE_KEYS as readonly string[]).includes(value);
}

/** The roles a real user holds: tenant roles in the active tenant, plus the platform role. */
export function availableRoles(ctx: SessionContextView): RoleKey[] {
  const held = new Set<RoleKey>([...ctx.platformRoles, ...ctx.roles.map((r) => r.role)]);
  return ROLE_RANK.filter((role) => held.has(role));
}

/** D-096: the preferred role if the user really holds it, else the most capable one; null without any role. */
export function chooseRole(ctx: SessionContextView, preferred: string | undefined): RoleKey | null {
  const roles = availableRoles(ctx);
  if (preferred && isRoleKey(preferred) && roles.includes(preferred)) return preferred;
  return roles[0] ?? null;
}

export function toSessionView(
  ctx: SessionContextView,
  role: RoleKey,
  labels: { wholeTenant: string; platform: string },
): SessionView {
  const branches = ctx.roles.filter((r) => r.role === role && r.branch).map((r) => r.branch!);
  const tenantWide = ctx.roles.some((r) => r.role === role && !r.branch);
  return {
    user: { id: ctx.user.id, displayName: ctx.user.displayName, email: ctx.user.email },
    role,
    scopeLabel:
      role === 'platform_super_admin'
        ? labels.platform
        : tenantWide || branches.length === 0
          ? labels.wholeTenant
          : branches.map((b) => b.name).join(', '),
    branchScope:
      tenantWide || branches.length === 0
        ? null
        : branches.map((b) => ({ id: b.id, name: b.name })),
    memberships: ctx.memberships
      .filter((m) => m.status === 'active' || m.active)
      .map((m) => ({
        tenantId: m.tenantId,
        tenantName: m.displayName,
        membershipId: m.membershipId,
      })),
    activeTenantId: ctx.activeTenant?.tenantId ?? null,
    permissions: [...new Set([...ctx.tenantPermissions, ...ctx.platformPermissions])],
    demo: false,
    availableRoles: availableRoles(ctx),
    support: ctx.support
      ? {
          sessionId: ctx.support.sessionId,
          tenantName: ctx.support.tenant.displayName,
          expiresAt: ctx.support.expiresAt,
        }
      : null,
  };
}

/**
 * Screens that exist only as Phase 1 demos: their nav item names the demo slice (1.5), so the phase that brings the
 * real screen is stated here (MASTER_PROMPT phases).
 */
const DEMO_SCREEN_PHASE: Readonly<Record<string, number>> = {
  '/platform': 6,
  '/admin': 5,
  '/admin/courses': 3,
  '/admin/reports': 5,
  '/learn': 4,
  '/learn/certificates': 4,
};

/** The nav item a path belongs to (longest matching href), across every workspace. */
export function navItemFor(pathname: string): NavItem | undefined {
  return Object.values(NAV)
    .flat()
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/**
 * The phase that brings a not-yet-real screen, shown to real users (D-097): the phase of the slice its nav item names,
 * or the stated phase for demo-only screens. Never a guess from the URL alone (UX review 2.4d).
 */
export function phaseFor(pathname: string): number {
  const item = navItemFor(pathname);
  if (!item) return 5;
  return DEMO_SCREEN_PHASE[item.href] ?? Number(item.slice.split('.')[0]);
}
