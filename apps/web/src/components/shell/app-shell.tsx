import * as React from 'react';
import Link from 'next/link';
import { CircleHelp } from 'lucide-react';
import { DemoBar } from '@/components/shell/demo-bar';
import { MobileNav } from '@/components/shell/mobile-nav';
import { SidebarBody } from '@/components/shell/sidebar';
import { MAIN_ID, SkipLink } from '@/components/shell/skip-link';
import { UserMenu } from '@/components/shell/user-menu';
import type { SessionView, Workspace } from '@/lib/api/session-types';
import { navFor } from '@/lib/nav';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/**
 * Authenticated workspace layout: dark sidebar (drawer below `lg`), top bar, and the page in <main>. Landmarks:
 * banner (top bar), navigation (sidebar), main. The top bar omits search, notifications and locale until they are
 * real (D-062).
 */
export function AppShell({
  session,
  workspace,
  children,
}: {
  session: SessionView;
  workspace: Workspace;
  children: React.ReactNode;
}) {
  const items = navFor(workspace, session.permissions);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <SkipLink />
      <aside
        aria-label={t.shell.sidebarLabel}
        className="surface-dark sticky top-0 hidden h-dvh bg-sidebar text-sidebar-foreground lg:block"
      >
        <SidebarBody session={session} workspace={workspace} items={items} />
      </aside>
      <div className="flex min-w-0 flex-col">
        {session.demo ? <DemoBar role={session.role} /> : null}
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-card px-2 sm:px-4 lg:px-6">
          <MobileNav session={session} workspace={workspace} items={items} />
          <div className="flex-1" />
          <Link
            href="/help"
            className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <CircleHelp aria-hidden="true" className="size-5" />
            <span className="hidden sm:inline">{t.shell.help}</span>
            <span className="sr-only sm:hidden">{t.shell.help}</span>
          </Link>
          <UserMenu session={session} />
        </header>
        <main
          id={MAIN_ID}
          tabIndex={-1}
          className="flex flex-1 flex-col gap-6 px-4 py-6 outline-none sm:px-6 lg:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
