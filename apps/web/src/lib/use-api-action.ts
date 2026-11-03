'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useFocusOnChange } from '@/components/inline-alert';
import { currentSession } from '@/lib/api/auth';
import type { ApiResult } from '@/lib/api/client';

/** A refused change: our message, and the API's invalid field names (first one as `field`). */
export type ActionFailure = {
  message: string;
  field?: string;
  fields: string[];
  /** The API's code per invalid field, e.g. `{ code: 'taken' }`. */
  fieldCodes: Record<string, string>;
};

type Failure = Extract<ApiResult<unknown>, { ok: false }>;

/**
 * One change from an admin screen (people 2.5b; branches, settings, job roles 2.5c): a fresh CSRF token, the call, the
 * screen's own error copy, and on success a re-render of the page from the API (never a local guess at the new state).
 * Ignores repeat clicks while pending.
 *
 * Messages: the section's alert (`statusRef`, focused when it appears). An action run from a reason dialog reports a
 * refusal inside the dialog only, so it is shown once; after the dialog closes on success, `onCloseAutoFocus`
 * moves focus to the section's message instead of the (possibly removed) trigger — WCAG 2.4.3 (UX review 2.5b).
 */
export function useApiAction(errorMessage: (result: Failure) => string) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const statusRef = useFocusOnChange<HTMLDivElement>(error ?? done);
  const acted = React.useRef(false);

  async function run<T>(
    fn: (csrfToken: string) => Promise<ApiResult<T>>,
    success: string,
    /**
     * `reason-dialog` and `inline`: the dialog or inline form shows a refusal itself; `confirm-dialog`: the section
     * shows it, and focus goes there when the dialog closes.
     */
    {
      from,
      onSuccess,
    }: {
      from?: 'reason-dialog' | 'confirm-dialog' | 'inline';
      /** Runs with the API's answer before the page re-renders (e.g. go to a record just created). */
      onSuccess?: (data: T) => void;
    } = {},
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
        message: errorMessage(result),
        field: result.error.fieldErrors?.[0]?.field,
        fields: (result.error.fieldErrors ?? []).map((f) => f.field),
        fieldCodes: Object.fromEntries(
          (result.error.fieldErrors ?? []).map((f) => [f.field, f.code]),
        ),
      };
      if (from !== 'reason-dialog' && from !== 'inline') {
        acted.current = from === 'confirm-dialog';
        setError(failure.message);
      }
      return failure;
    }
    acted.current = from === 'reason-dialog' || from === 'confirm-dialog';
    setDone(success);
    onSuccess?.(result.data);
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
