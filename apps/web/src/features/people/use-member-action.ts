'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useFocusOnChange } from '@/components/inline-alert';
import { currentSession } from '@/lib/api/auth';
import type { ApiResult } from '@/lib/api/client';
import { peopleErrorMessage } from './messages';

export type ActionFailure = { message: string; field?: string };

/**
 * One change to a member from the detail page: a fresh CSRF token, the call, our own error copy, and on success a
 * re-render of the page from the API (never a local guess at the new state). Ignores repeat clicks while pending.
 *
 * Messages: the section's alert (`statusRef`, focused when it appears). An action run from a reason dialog reports a
 * refusal inside the dialog only, so it is shown once; after the dialog closes on success, `onCloseAutoFocus`
 * moves focus to the section's message instead of the (possibly removed) trigger — WCAG 2.4.3 (UX review 2.5b).
 */
export function useMemberAction() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const statusRef = useFocusOnChange<HTMLDivElement>(error ?? done);
  const acted = React.useRef(false);

  async function run<T>(
    fn: (csrfToken: string) => Promise<ApiResult<T>>,
    success: string,
    /** `reason-dialog`: the dialog shows a refusal itself (it stays open); `confirm-dialog`: the section shows it. */
    { from }: { from?: 'reason-dialog' | 'confirm-dialog' } = {},
  ): Promise<ActionFailure | null> {
    if (pending) return null;
    setPending(true);
    setError(null);
    setDone(null);
    const session = await currentSession();
    const result = session.ok ? await fn(session.data.csrfToken) : session;
    setPending(false);
    if (!result.ok) {
      const failure = {
        message: peopleErrorMessage(result),
        field: result.error.fieldErrors?.[0]?.field,
      };
      if (from !== 'reason-dialog') {
        acted.current = from === 'confirm-dialog';
        setError(failure.message);
      }
      return failure;
    }
    acted.current = from !== undefined;
    setDone(success);
    router.refresh();
    return null;
  }

  /** For a dialog's `onCloseAutoFocus`: after an action, focus its message; after a plain cancel, the trigger. */
  function onCloseAutoFocus(event: Event) {
    if (!acted.current) return;
    acted.current = false;
    event.preventDefault();
    statusRef.current?.focus();
  }

  return {
    run,
    pending,
    error,
    done,
    statusRef,
    onCloseAutoFocus,
    clear: () => {
      acted.current = false;
      setError(null);
      setDone(null);
    },
  };
}
