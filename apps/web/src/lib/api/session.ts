import { cookies } from 'next/headers';
import { buildDemoSession, DEFAULT_DEMO_ROLE } from '@/mocks/demo-session';
import { ROLE_KEYS, type RoleKey, type SessionView } from './session-types';

/** Demo-only cookies (D-063). They choose which fixture to show and are never read by anything that authorizes. */
export const DEMO_ROLE_COOKIE = 'vl_demo_role';
export const DEMO_TENANT_COOKIE = 'vl_demo_tenant';

export function isRoleKey(value: unknown): value is RoleKey {
  return typeof value === 'string' && (ROLE_KEYS as readonly string[]).includes(value);
}

/**
 * The current session, for server components. Phase 1: built from demo fixtures selected by the demo cookies.
 * Phase 2: replaced by a call to `GET /api/v1/session` with the user's session cookie; the return type stays.
 */
export async function getSession(): Promise<SessionView> {
  const jar = await cookies();
  const roleCookie = jar.get(DEMO_ROLE_COOKIE)?.value;
  const role = isRoleKey(roleCookie) ? roleCookie : DEFAULT_DEMO_ROLE;
  return buildDemoSession(role, jar.get(DEMO_TENANT_COOKIE)?.value ?? null);
}
