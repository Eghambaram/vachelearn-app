import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SessionUnavailableState } from '@/components/shell/session-unavailable';
import { SignOutButton } from '@/features/auth/sign-out-button';
import { cookies } from 'next/headers';
import { WORKSPACE_ROLE_COOKIE } from '@/lib/api/session';
import { ROLE_WORKSPACE, WORKSPACE_HOME } from '@/lib/api/session-types';
import { getAuthState, getSessionContext } from '@/lib/auth/session';
import { chooseRole } from '@/lib/auth/session-view';
import { formatDateTime } from '@/lib/format';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.auth.welcomeTitle };

// Per request: who is signed in comes from the session cookie, checked by the API.
export const dynamic = 'force-dynamic';

/**
 * Where a signed-in user lands (Slice 2.3d). Someone with a role goes on to their workspace (D-096, 2.4d); an account
 * without one (not added to an organisation yet) sees who is signed in, when the session ends (D-084) and the way out.
 */
export default async function WelcomePage() {
  const state = await getAuthState();
  if (state.status === 'signed-out') redirect('/login');
  // A user with a role lands in the workspace of their most capable (or chosen) role (D-096).
  if (state.status === 'signed-in') {
    const context = await getSessionContext();
    if (context.status === 'unavailable') {
      return <SessionUnavailableState />;
    }
    if (context.status === 'signed-in') {
      const role = chooseRole(context.context, (await cookies()).get(WORKSPACE_ROLE_COOKIE)?.value);
      if (role) redirect(WORKSPACE_HOME[ROLE_WORKSPACE[role]]);
      // Several organisations and none chosen yet: choose one first (D-089). Anyone else without a role stays here —
      // the picker would have nothing to offer them (UX review 2.4d).
      const active = context.context.memberships.filter((m) => m.status === 'active');
      if (active.length >= 2 && !context.context.activeTenant) redirect('/select-workspace');
    }
  }
  if (state.status === 'unavailable') {
    return <SessionUnavailableState />;
  }
  const { session } = state;
  return (
    <>
      <h1 className="text-2xl font-semibold">{t.auth.welcomeTitle}</h1>
      <dl className="flex flex-col gap-1">
        <dt className="text-sm text-muted-foreground">{t.auth.signedInAs}</dt>
        <dd className="font-medium">
          {session.user.displayName}
          <span className="block text-sm font-normal break-all text-muted-foreground">
            {session.user.email}
          </span>
        </dd>
      </dl>
      <p className="text-sm text-muted-foreground">{t.auth.noWorkspaceYet}</p>
      <p className="text-sm text-muted-foreground">
        {t.auth.sessionEnds(formatDateTime(session.expiresAt))}
      </p>
      <SignOutButton />
    </>
  );
}
