import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { Button } from '@/components/ui/button';
import { GroupList } from '@/features/groups/group-list';
import { RealDataOnly } from '@/features/people/real-data-only';
import { readGroups } from '@/lib/api/groups-server';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';
import { groupScopes } from './scopes';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.groups.title };

// Per request: the list comes from the API with the caller's session and scope.
export const dynamic = 'force-dynamic';

/** Groups (Slice 3.2). The API scopes the list (D-121); the permission check here only picks the state. */
export default async function GroupsPage() {
  const session = await getSession();
  if (session.demo) return <RealDataOnly />;
  if (!session.permissions.includes('group.read')) return <PermissionDenied headingLevel="h1" />;
  const [initial, scopes] = await Promise.all([
    readGroups({ sort: 'name', direction: 'asc' }),
    groupScopes(session),
  ]);
  if (!initial.ok && initial.status === 403) return <PermissionDenied headingLevel="h1" />;
  // The API checks `group.manage` and the scope again.
  const canCreate = session.permissions.includes('group.manage') && !session.support;
  return (
    <>
      <PageHeader
        title={t.groups.title}
        description={t.groups.description}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/admin/groups/new">
                <Plus aria-hidden="true" />
                {t.groups.add}
              </Link>
            </Button>
          ) : null
        }
      />
      <GroupList initial={initial} scopes={scopes} canCreate={canCreate} />
    </>
  );
}
