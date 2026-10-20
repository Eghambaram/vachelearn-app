import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowRight, Check } from 'lucide-react';
import { switchDemoRole } from '@/app/demo-actions';
import { DemoBadge } from '@/components/demo-badge';
import { WorkspacePickerItem } from '@/components/shell/workspace-picker-item';
import { getSession } from '@/lib/api/session';
import { ROLE_KEYS } from '@/lib/api/session-types';
import { isDemoWorkspacesEnabled } from '@/lib/dev-tools';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.auth.selectWorkspaceTitle };

// The demo gate (D-063) is read at request time, like /design, so one build serves both states.
export const dynamic = 'force-dynamic';

/**
 * Workspace picker (UI spec #47) plus, in demo mode, the role list. Phase 2 lists the user's real memberships from
 * the API; the role list disappears with the demo layer (D-063).
 */
export default async function SelectWorkspacePage() {
  if (!isDemoWorkspacesEnabled()) notFound();
  const session = await getSession();
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
