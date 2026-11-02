import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/** Demo workspaces (D-063) have no real organisation: screens built on the real API say so instead of faking it. */
export function RealDataOnly() {
  return (
    <EmptyState
      headingLevel="h1"
      title={t.people.realDataOnlyTitle}
      description={t.people.realDataOnlyBody}
      action={
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {t.auth.signInAction}
        </Link>
      }
    />
  );
}
