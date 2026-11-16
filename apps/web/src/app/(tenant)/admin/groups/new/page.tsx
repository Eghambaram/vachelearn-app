import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { NewGroup } from '@/features/groups/group-form';
import { RealDataOnly } from '@/features/people/real-data-only';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';
import { groupScopes } from '../scopes';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.groups.newTitle };

export const dynamic = 'force-dynamic';

/** Create a group (Slice 3.2): `group.manage`; a branch-scoped caller chooses one of its branches only (D-121). */
export default async function NewGroupPage() {
  const session = await getSession();
  if (session.demo) return <RealDataOnly />;
  if (!session.permissions.includes('group.manage') || session.support) {
    return <PermissionDenied headingLevel="h1" />;
  }
  const scopes = await groupScopes(session);
  return (
    <>
      <PageHeader
        title={t.groups.newTitle}
        breadcrumbs={[
          { label: t.groups.title, href: '/admin/groups' },
          { label: t.groups.newTitle },
        ]}
      />
      <NewGroup scopes={scopes} />
    </>
  );
}
