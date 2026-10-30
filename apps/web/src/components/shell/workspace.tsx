import * as React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Construction } from 'lucide-react';
import { DemoBadge } from '@/components/demo-badge';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { AppShell } from '@/components/shell/app-shell';
import { SessionUnavailableState } from '@/components/shell/session-unavailable';
import { Button } from '@/components/ui/button';
import { getSession, SessionUnavailableError } from '@/lib/api/session';
import { navItemFor, phaseFor } from '@/lib/auth/session-view';
import { ROLE_WORKSPACE, WORKSPACE_HOME, type Workspace } from '@/lib/api/session-types';
import { isDemoWorkspacesEnabled } from '@/lib/dev-tools';
import { findNavItem } from '@/lib/nav';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/**
 * Layout for one workspace route group (Slice 2.4d). Real sessions (API, D-096): the user's chosen or most capable
 * role decides the workspace; routes not yet built against the API show "not available yet" (D-097) and the demo page
 * is never rendered. Demo sessions (development, D-063): as in Phase 1. A role that does not work in this workspace
 * gets its own shell with a permission-denied page — the route's existence is not secret, so 403 is honest here;
 * resources hidden by tenant/branch scope return 404 instead.
 */
export async function WorkspaceLayout({
  workspace,
  children,
}: {
  workspace: Workspace;
  children: React.ReactNode;
}) {
  let session: Awaited<ReturnType<typeof getSession>>;
  try {
    session = await getSession();
  } catch (err) {
    if (!(err instanceof SessionUnavailableError)) throw err;
    return <SessionUnavailable />;
  }
  if (session.demo && !isDemoWorkspacesEnabled()) notFound();
  const own = ROLE_WORKSPACE[session.role];
  if (own !== workspace) {
    return (
      <AppShell session={session} workspace={own}>
        <PermissionDenied
          headingLevel="h1"
          action={
            <Button asChild variant="outline">
              <Link href={WORKSPACE_HOME[own]}>{t.placeholder.back}</Link>
            </Button>
          }
        />
      </AppShell>
    );
  }
  return (
    <AppShell session={session} workspace={workspace}>
      {children}
    </AppShell>
  );
}

/**
 * For pages that still render Phase 1 demo data: a real session gets "not available yet" with the phase that brings
 * the screen (D-097), and the demo page is never rendered. Called at the top of each such page — pages run on every
 * navigation, layouts do not. Returns null for demo sessions.
 */
export async function notAvailableForRealSession(pathname: string) {
  try {
    const session = await getSession();
    return session.demo ? null : <NotAvailableYet pathname={pathname} />;
  } catch (err) {
    if (err instanceof SessionUnavailableError) return <SessionUnavailable />;
    throw err;
  }
}

/**
 * The same rule for a demo page's `generateMetadata`: a real session never runs its demo fetchers, even for the tab
 * title (security review 2.4d). Returns the screen's own name for real sessions, null for demo sessions.
 */
export async function notAvailableMetadata(pathname: string): Promise<Metadata | null> {
  const session = await getSession().catch(() => null);
  if (session?.demo) return null;
  return { title: navItemFor(pathname)?.label ?? t.shell.notAvailableTitle };
}

/**
 * A real session on a screen that still shows Phase 1 demo data elsewhere (D-097): the screen keeps its own name as the
 * heading; the state says it is not available yet and which phase brings it.
 */
export function NotAvailableYet({ pathname }: { pathname: string }) {
  const phase = phaseFor(pathname);
  return (
    <>
      <PageHeader title={navItemFor(pathname)?.label ?? t.shell.notAvailableTitle} />
      <EmptyState
        icon={<Construction />}
        title={t.shell.notAvailableTitle}
        description={t.shell.notAvailableBody(phase)}
      />
    </>
  );
}

export function SessionUnavailable() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <SessionUnavailableState />
    </main>
  );
}

function pathOf(workspace: Workspace, slug: string[] | undefined) {
  return [WORKSPACE_HOME[workspace], ...(slug ?? [])].join('/');
}

export async function workspacePlaceholderMetadata(
  workspace: Workspace,
  slug: string[] | undefined,
): Promise<Metadata> {
  const item = findNavItem(workspace, pathOf(workspace, slug));
  return { title: item?.label ?? t.system.notFoundTitle, robots: { index: false, follow: false } };
}

/**
 * The page for a nav item whose screen is not built yet (D-061): unknown paths 404; items the role may not see show
 * permission-denied; otherwise an honest "planned for slice N" page.
 */
export async function WorkspacePlaceholder({
  workspace,
  slug,
}: {
  workspace: Workspace;
  slug: string[] | undefined;
}) {
  const item = findNavItem(workspace, pathOf(workspace, slug));
  if (!item) notFound();
  const session = await getSession();
  if (!session.permissions.includes(item.permission)) {
    return <PermissionDenied headingLevel="h1" />;
  }
  // Real sessions: the phase that brings the screen, not the internal slice (D-097).
  if (!session.demo) return <NotAvailableYet pathname={item.href} />;
  const home = WORKSPACE_HOME[workspace];
  return (
    <>
      <PageHeader title={item.label} meta={<DemoBadge />} />
      <EmptyState
        icon={<Construction />}
        title={t.placeholder.title(item.label)}
        description={t.placeholder.body(item.slice)}
        action={
          item.href === home ? null : (
            <Button asChild variant="outline">
              <Link href={home}>{t.placeholder.back}</Link>
            </Button>
          )
        }
      />
    </>
  );
}
