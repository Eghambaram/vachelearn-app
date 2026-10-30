import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Check } from 'lucide-react';
import { switchDemoRole } from '@/app/demo-actions';
import { DemoBadge } from '@/components/demo-badge';
import { EmptyState } from '@/components/empty-state';
import { SessionUnavailableState } from '@/components/shell/session-unavailable';
import { WorkspacePickerItem } from '@/components/shell/workspace-picker-item';
import { chooseWorkspaceRole } from '@/app/demo-actions';
import { SignOutButton } from '@/features/auth/sign-out-button';
import { TenantSwitchList } from '@/features/auth/tenant-switch';
import { cookies } from 'next/headers';
import { getSession, WORKSPACE_ROLE_COOKIE } from '@/lib/api/session';
import { getSessionContext } from '@/lib/auth/session';
import { availableRoles, chooseRole } from '@/lib/auth/session-view';
import {
  ROLE_KEYS,
  ROLE_WORKSPACE,
  WORKSPACE_HOME,
  type SessionView,
} from '@/lib/api/session-types';
import { isDemoWorkspacesEnabled } from '@/lib/dev-tools';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.auth.selectWorkspaceTitle };

// The demo gate (D-063) is read at request time, like /design, so one build serves both states.
export const dynamic = 'force-dynamic';

/**
 * Organisation and workspace picker (UI spec #47). Real sessions (2.4d): the user's memberships from the API (switching
 * is checked server-side, D-089) and the roles they hold in the active organisation (D-096). Demo sessions (D-063):
 * the fixture memberships and the demo role list, as in Phase 1.
 */
export default async function SelectWorkspacePage() {
  const real = await getSessionContext();
  if (real.status === 'unavailable') return <SessionUnavailableState />;
  if (real.status === 'rejected') redirect('/login?expired=1');
  if (real.status === 'signed-out') {
    if (!isDemoWorkspacesEnabled()) redirect('/login');
    return <DemoPicker session={await getSession()} />;
  }
  // Read straight from the API session: a member who has not chosen an organisation yet has no role to show.
  const ctx = real.context;
  const roles = availableRoles(ctx);
  const current = chooseRole(ctx, (await cookies()).get(WORKSPACE_ROLE_COOKIE)?.value);
  const memberships = ctx.memberships.filter((m) => m.status === 'active' || m.active);
  // Nothing to choose (no organisation, no role here): say so and offer the ways out, never an empty page.
  if (!ctx.support && memberships.length < 2 && roles.length === 0) {
    return (
      <>
        <h1 className="text-2xl font-semibold">{t.shell.switchTitle}</h1>
        <EmptyState title={t.shell.nothingToChoose} description={t.auth.noWorkspaceYet} />
        <SignOutButton />
      </>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-semibold">{t.shell.switchTitle}</h1>
      {current ? (
        <Link
          href={WORKSPACE_HOME[ROLE_WORKSPACE[current]]}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t.shell.backToWorkspace}
        </Link>
      ) : null}
      {ctx.support ? (
        <p className="text-sm text-muted-foreground">
          {t.shell.supportActive(ctx.support.tenant.displayName)}
        </p>
      ) : memberships.length > 0 ? (
        <section aria-labelledby="switch-organisation" className="flex flex-col gap-3">
          <h2 id="switch-organisation" className="text-lg font-semibold">
            {t.shell.switchOrganisation}
          </h2>
          <TenantSwitchList
            memberships={memberships.map((m) => ({
              membershipId: m.membershipId,
              tenantId: m.tenantId,
              tenantName: m.displayName,
            }))}
            activeTenantId={ctx.activeTenant?.tenantId ?? null}
          />
        </section>
      ) : null}
      {roles.length > 0 ? (
        <section aria-labelledby="switch-role" className="flex flex-col gap-3 border-t pt-6">
          <h2 id="switch-role" className="text-lg font-semibold">
            {t.shell.switchRole}
          </h2>
          <ul className="flex flex-col gap-2">
            {roles.map((role) => (
              <li key={role}>
                <form action={chooseWorkspaceRole}>
                  <input type="hidden" name="role" value={role} />
                  <button
                    type="submit"
                    aria-current={role === current ? 'true' : undefined}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium hover:bg-muted"
                  >
                    {t.roles[role]}
                    {role === current ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-primary">
                        <Check aria-hidden="true" className="size-4" />
                        {t.shell.currentLabel}
                      </span>
                    ) : (
                      <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
                    )}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** Phase 1 demo picker (D-063). */
function DemoPicker({ session }: { session: SessionView }) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{t.auth.selectWorkspaceTitle}</h1>
          <DemoBadge />
        </div>
        <p className="text-muted-foreground">{t.auth.selectWorkspaceBody}</p>
      </div>
      {session.memberships.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {session.memberships.map((membership) => (
            <li key={membership.tenantId}>
              <WorkspacePickerItem
                tenantId={membership.tenantId}
                name={membership.tenantName}
                current={membership.tenantId === session.activeTenantId}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <section aria-labelledby="demo-roles" className="flex flex-col gap-3 border-t pt-6">
        <h2 id="demo-roles" className="text-lg font-semibold">
          {t.auth.demoRolesTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{t.auth.demoRolesBody}</p>
        <ul className="flex flex-col gap-2">
          {ROLE_KEYS.map((role) => (
            <li key={role}>
              <form action={switchDemoRole}>
                <input type="hidden" name="role" value={role} />
                <button
                  type="submit"
                  className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium hover:bg-muted"
                >
                  {t.roles[role]}
                  {role === session.role ? (
                    <Check aria-label={t.auth.currentRole} className="size-4 text-primary" />
                  ) : (
                    <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
                  )}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
