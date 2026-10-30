import Link from 'next/link';
import { ErrorState } from '@/components/error-state';
import { ReloadButton } from '@/components/reload-button';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/** The API did not answer the session check: say so, offer a retry and a way back to sign-in (UX review 2.4d). */
export function SessionUnavailableState() {
  return (
    <ErrorState
      headingLevel="h1"
      title={t.shell.sessionUnavailableTitle}
      description={t.shell.sessionUnavailableBody}
      action={
        <>
          <ReloadButton />
          <Link
            href="/login"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t.shell.signInAgain}
          </Link>
        </>
      }
    />
  );
}
