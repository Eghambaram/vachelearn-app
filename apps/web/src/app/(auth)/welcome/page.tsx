import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { InlineAlert } from '@/components/inline-alert';
import { SignOutButton } from '@/features/auth/sign-out-button';
import { getAuthState } from '@/lib/auth/session';
import { formatDateTime } from '@/lib/format';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.auth.welcomeTitle };

// Per request: who is signed in comes from the session cookie, checked by the API.
export const dynamic = 'force-dynamic';

/**
 * Where a signed-in user lands (Slice 2.3d). Until roles and memberships exist (2.4) a real account has no workspace,
 * so this shows who is signed in, when the session ends (D-084) and the way out.
 */
export default async function WelcomePage() {
  const state = await getAuthState();
  if (state.status === 'signed-out') redirect('/login');
  if (state.status === 'unavailable') {
    return (
      <>
        <h1 className="text-2xl font-semibold">{t.auth.welcomeTitle}</h1>
        <InlineAlert tone="danger">{t.auth.serviceUnavailable}</InlineAlert>
      </>
    );
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
