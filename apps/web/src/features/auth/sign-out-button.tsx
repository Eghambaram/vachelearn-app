'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { InlineAlert, useFocusOnChange } from '@/components/inline-alert';
import { Button } from '@/components/ui/button';
import { currentSession, logout } from '@/lib/api/auth';
import { getMessages } from '@/lib/i18n';
import { authErrorMessage } from './messages';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/**
 * Sign out: ends the session on the server (the API clears the cookie). The CSRF token is fetched fresh from
 * `/auth/me` just before, so it is never kept in the page. Only a 401 there means "already signed out"; any other
 * failure keeps the user here with the error, so nobody walks away from a shared device believing they signed out.
 */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const errorRef = useFocusOnChange<HTMLDivElement>(error);

  async function signOut() {
    if (pending) return;
    setPending(true);
    setError(null);
    const session = await currentSession();
    if (!session.ok && session.status !== 401) {
      setPending(false);
      setError(authErrorMessage(session));
      return;
    }
    if (session.ok) {
      const result = await logout(session.data.csrfToken);
      if (!result.ok && result.status !== 401) {
        setPending(false);
        setError(authErrorMessage(result));
        return;
      }
    }
    router.replace('/login?signedOut=1');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <InlineAlert ref={errorRef} tone="danger">
          {error}
        </InlineAlert>
      ) : null}
      <Button
        type="button"
        variant="outline"
        onClick={signOut}
        aria-disabled={pending || undefined}
        className="self-start"
      >
        {pending ? t.auth.signingOut : t.auth.signOut}
      </Button>
    </div>
  );
}
