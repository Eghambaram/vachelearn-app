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
import { Button } from '@/components/ui/button';
import { getSession } from '@/lib/api/session';
import { ROLE_WORKSPACE, WORKSPACE_HOME, type Workspace } from '@/lib/api/session-types';
import { isDemoWorkspacesEnabled } from '@/lib/dev-tools';
import { findNavItem } from '@/lib/nav';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/**
 * Layout for one workspace route group. 404 when demo workspaces are off (D-063). A role that does not work in this
 * workspace gets its own shell with a permission-denied page — the route's existence is not secret, so 403 is
 * honest here; resources hidden by tenant/branch scope return 404 instead.
 */
export async function WorkspaceLayout({
  workspace,
  children,
}: {
  workspace: Workspace;
  children: React.ReactNode;
}) {
  if (!isDemoWorkspacesEnabled()) notFound();
  const session = await getSession();
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
