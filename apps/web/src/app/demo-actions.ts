'use server';

import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import {
  DEMO_ROLE_COOKIE,
  DEMO_TENANT_COOKIE,
  getSession,
  isRoleKey,
  WORKSPACE_ROLE_COOKIE,
} from '@/lib/api/session';
import { getSessionContext } from '@/lib/auth/session';
import { availableRoles } from '@/lib/auth/session-view';
import { ROLE_WORKSPACE, WORKSPACE_HOME } from '@/lib/api/session-types';
import { isDemoWorkspacesEnabled } from '@/lib/dev-tools';
import { DEMO_TENANTS } from '@/mocks/demo-session';

/*
 * Workspace switches. The demo ones (D-063) pick which fixture session is shown; there is no authentication behind
 * them. The real tenant switch is an API call that checks the user's memberships (client side); the real role choice
 * below only picks which of the user's API-confirmed roles the shell shows.
 */

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;

export async function switchDemoRole(formData: FormData): Promise<void> {
  if (!isDemoWorkspacesEnabled()) notFound();
  const role = formData.get('role');
  if (!isRoleKey(role)) return;
  (await cookies()).set(DEMO_ROLE_COOKIE, role, COOKIE_OPTIONS);
  redirect(WORKSPACE_HOME[ROLE_WORKSPACE[role]]);
}

export async function switchDemoTenant(tenantId: string): Promise<void> {
  if (!isDemoWorkspacesEnabled()) notFound();
  if (!DEMO_TENANTS.some((tenant) => tenant.tenantId === tenantId)) return;
  (await cookies()).set(DEMO_TENANT_COOKIE, tenantId, COOKIE_OPTIONS);
  // Tenant-specific pages must not survive a tenant switch: start again at the workspace home.
  const session = await getSession();
  redirect(WORKSPACE_HOME[ROLE_WORKSPACE[session.role]]);
}

/**
 * Real sessions (D-096): show the workspace of another role the user really holds. The roles come from the API on
 * every request; this cookie only picks one of them for navigation — it grants nothing.
 */
export async function chooseWorkspaceRole(formData: FormData): Promise<void> {
  const role = formData.get('role');
  const real = await getSessionContext();
  if (
    real.status !== 'signed-in' ||
    !isRoleKey(role) ||
    !availableRoles(real.context).includes(role)
  ) {
    redirect('/select-workspace');
  }
  // `__Host-`: Secure, Path=/, no Domain — a sibling subdomain cannot plant it.
  (await cookies()).set(WORKSPACE_ROLE_COOKIE, role, { ...COOKIE_OPTIONS, secure: true });
  redirect(WORKSPACE_HOME[ROLE_WORKSPACE[role]]);
}

/** On sign-out: forget the workspace choice, so the next person on a shared device starts from their own roles. */
export async function clearWorkspaceRole(): Promise<void> {
  (await cookies()).delete({ name: WORKSPACE_ROLE_COOKIE, path: '/', secure: true });
}
