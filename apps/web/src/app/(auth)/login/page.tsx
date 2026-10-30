import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { InlineAlert } from '@/components/inline-alert';
import { Button } from '@/components/ui/button';
import { LoginForm } from '@/features/auth/login-form';
import { getAuthState } from '@/lib/auth/session';
import { isDemoWorkspacesEnabled } from '@/lib/dev-tools';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.publicSite.signIn };

// The demo gate (D-063) and the session are read at request time, so one build serves every state.
export const dynamic = 'force-dynamic';

/** Sign-in (Slice 2.3d), against the real API through the web origin (D-085). */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if ((await getAuthState()).status === 'signed-in') redirect('/welcome');
  const params = await searchParams;
  const signedOut = params.signedOut === '1';
  const expired = params.expired === '1';
  return (
    <>
      <h1 className="text-2xl font-semibold">{t.auth.signInTitle}</h1>
      {signedOut ? <InlineAlert tone="success">{t.auth.signedOut}</InlineAlert> : null}
      {expired ? <InlineAlert tone="danger">{t.auth.sessionEnded}</InlineAlert> : null}
      <LoginForm />
      {isDemoWorkspacesEnabled() ? (
        <Button asChild variant="outline" className="self-start">
          <Link href="/select-workspace">{t.publicSite.demo}</Link>
        </Button>
      ) : null}
    </>
  );
}
