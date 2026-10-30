import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/auth/session';
import { chooseRole, isRoleKey, toSessionView } from '@/lib/auth/session-view';
import { isDemoWorkspacesEnabled } from '@/lib/dev-tools';
import { getMessages } from '@/lib/i18n';
import { buildDemoSession, DEFAULT_DEMO_ROLE } from '@/mocks/demo-session';
import type { SessionView } from './session-types';

export { isRoleKey };

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/** Demo-only cookies (D-063). They choose which fixture to show and are never read by anything that authorizes. */
export const DEMO_ROLE_COOKIE = 'vl_demo_role';
export const DEMO_TENANT_COOKIE = 'vl_demo_tenant';
/** Which of the user's real roles the shell shows (D-096). Navigation only: the API checks every action. */
export const WORKSPACE_ROLE_COOKIE = '__Host-vl_workspace_role';

/** Thrown when the API cannot say who is signed in (down, timed out): pages show an error, never a demo session. */
export class SessionUnavailableError extends Error {
  override name = 'SessionUnavailableError';
}

/**
 * The current session, for server components (Slice 2.4d). A signed-in user gets the session the API computes from
 * their memberships and roles (`GET /api/v1/auth/session`), shown in the workspace of their most capable role or the
 * one they chose (D-096). Without a sign-in: the demo fixtures when demo workspaces are on (development, D-063),
 * otherwise the sign-in page. A real user with no role at all goes to `/welcome`.
 */
export const getSession = cache(async function getSession(): Promise<SessionView> {
  const real = await getSessionContext();
  const jar = await cookies();
  if (real.status === 'signed-in') {
    const role = chooseRole(real.context, jar.get(WORKSPACE_ROLE_COOKIE)?.value);
    if (!role) redirect('/welcome');
    return toSessionView(real.context, role, {
      wholeTenant: t.shell.scopeWholeTenant,
      platform: t.shell.scopePlatform,
    });
  }
  if (real.status === 'unavailable')
    throw new SessionUnavailableError('The session could not be checked');
  // A real session that ended (expired, revoked): sign in again — never the demo fixtures (security review 2.4d).
  if (real.status === 'rejected') redirect('/login?expired=1');
  if (!isDemoWorkspacesEnabled()) redirect('/login');
  const roleCookie = jar.get(DEMO_ROLE_COOKIE)?.value;
  const role = isRoleKey(roleCookie) ? roleCookie : DEFAULT_DEMO_ROLE;
  return buildDemoSession(role, jar.get(DEMO_TENANT_COOKIE)?.value ?? null);
});
