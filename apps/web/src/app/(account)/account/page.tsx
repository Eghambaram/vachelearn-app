import type { Metadata } from 'next';
import { UserRound } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.shell.profile };

/** Profile and password (UI spec #46) arrive with authentication in slice 2.3. */
export default function AccountPage() {
  return (
    <>
      <PageHeader title={t.shell.profile} />
      <EmptyState
        icon={<UserRound />}
        title={t.placeholder.title(t.shell.profile)}
        description={t.placeholder.body('2.3')}
      />
    </>
  );
}
