'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { clearWorkspaceRole } from '@/app/demo-actions';
import { currentSession, logout } from '@/lib/api/auth';
import { authErrorMessage } from './messages';

/**
 * Sign-out, shared by the welcome page and the user menu (UX review 2.4d). Fetches a fresh CSRF token; only a 401
 * counts as already signed out — any other failure is shown, never pretended (a shared device must not look signed
 * out). Forgets the workspace choice, so the next person starts from their own roles. Ignores repeat clicks.
 */
export function useSignOut() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function signOut() {
    if (pending) return;
    setPending(true);
    setError(null);
    const session = await currentSession();
    const result = session.ok ? await logout(session.data.csrfToken) : null;
    const failure =
      !session.ok && session.status !== 401
        ? session
        : result && !result.ok && result.status !== 401
          ? result
          : null;
    if (failure) {
      setPending(false);
      setError(authErrorMessage(failure));
      return;
    }
    await clearWorkspaceRole().catch(() => undefined);
    router.replace('/login?signedOut=1');
    router.refresh();
  }

  return { signOut, pending, error };
}
