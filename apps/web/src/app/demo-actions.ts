'use server';

import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { DEMO_ROLE_COOKIE, DEMO_TENANT_COOKIE, getSession, isRoleKey } from '@/lib/api/session';
import { ROLE_WORKSPACE, WORKSPACE_HOME } from '@/lib/api/session-types';
import { isDemoWorkspacesEnabled } from '@/lib/dev-tools';
import { DEMO_TENANTS } from '@/mocks/demo-session';

/*
 * Demo-only switches (D-063). They pick which fixture session is shown; there is no authentication behind them.
 * Phase 2 deletes these: the real tenant switch is an API call that checks the user's memberships.
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
