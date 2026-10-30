'use client';

import { InlineAlert, useFocusOnChange } from '@/components/inline-alert';
import { Button } from '@/components/ui/button';
import { getMessages } from '@/lib/i18n';
import { useSignOut } from './use-sign-out';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/** Sign out (see `useSignOut`: never pretends; the error is shown and focused). */
export function SignOutButton() {
  const { signOut, pending, error } = useSignOut();
  const errorRef = useFocusOnChange<HTMLDivElement>(error);
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
