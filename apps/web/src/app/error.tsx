'use client';

import { ErrorState } from '@/components/error-state';
import { MAIN_ID } from '@/components/shell/skip-link';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/**
 * Error boundary for unexpected failures (UI spec #56). Shows Next's error digest as the support reference — never
 * the message or stack, which may contain internal details.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id={MAIN_ID} className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
      <ErrorState
        headingLevel="h1"
        title={t.system.errorTitle}
        description={t.system.errorBody}
        requestId={error.digest}
        onRetry={reset}
      />
    </main>
  );
}
