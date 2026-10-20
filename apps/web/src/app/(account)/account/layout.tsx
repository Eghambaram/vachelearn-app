import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { getSession } from '@/lib/api/session';
import { ROLE_WORKSPACE } from '@/lib/api/session-types';
import { isDemoWorkspacesEnabled } from '@/lib/dev-tools';

// The demo gate (D-063) is read at request time, like /design, so one build serves both states.
export const dynamic = 'force-dynamic';

/** Account pages belong to every signed-in user, so they render inside the user's own workspace shell. */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  if (!isDemoWorkspacesEnabled()) notFound();
  const session = await getSession();
  return (
    <AppShell session={session} workspace={ROLE_WORKSPACE[session.role]}>
      {children}
    </AppShell>
  );
}
