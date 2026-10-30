import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { SessionUnavailable } from '@/components/shell/workspace';
import { getSession, SessionUnavailableError } from '@/lib/api/session';
import { ROLE_WORKSPACE } from '@/lib/api/session-types';
import { isDemoWorkspacesEnabled } from '@/lib/dev-tools';

// The demo gate (D-063) is read at request time, like /design, so one build serves both states.
export const dynamic = 'force-dynamic';

/** Account pages belong to every signed-in user, so they render inside the user's own workspace shell. */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  let session: Awaited<ReturnType<typeof getSession>>;
  try {
    session = await getSession();
  } catch (err) {
    if (err instanceof SessionUnavailableError) return <SessionUnavailable />;
    throw err;
  }
  if (session.demo && !isDemoWorkspacesEnabled()) notFound();
  return (
    <AppShell session={session} workspace={ROLE_WORKSPACE[session.role]}>
      {children}
    </AppShell>
  );
}
