import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { FocusedNotice } from '@/components/focused-notice';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { ReloadButton } from '@/components/reload-button';
import { StatusBadge } from '@/components/status-badge';
import { GroupDetails, GroupStatusSection } from '@/features/groups/group-detail';
import { GroupMembers } from '@/features/groups/group-members';
import { RealDataOnly } from '@/features/people/real-data-only';
import { readGroup, readGroupMembers } from '@/lib/api/groups-server';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const g = t.groups;

export const metadata: Metadata = { title: g.detailsTitle };

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * One group (Slice 3.2): details, status and members. A group the caller cannot see is "not found" — never
 * "forbidden" (the API answers 404; existence never leaks). The API says whether this caller manages it.
 */
export default async function GroupPage({ params, searchParams }: Props) {
  const session = await getSession();
  if (session.demo) return <RealDataOnly />;
  if (!session.permissions.includes('group.read')) return <PermissionDenied headingLevel="h1" />;
  const { groupId } = await params;
  const back = (
    <Link
      href="/admin/groups"
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      {g.backToGroups}
    </Link>
  );
  const [result, members] = UUID.test(groupId)
    ? await Promise.all([readGroup(groupId), readGroupMembers(groupId)])
    : [null, null];
  if (!result || !members || (!result.ok && result.status === 404)) {
    return (
      <EmptyState
        headingLevel="h1"
        title={g.notFoundTitle}
        description={g.notFoundBody}
        action={back}
      />
    );
  }
  if (!result.ok) {
    return result.status === 403 ? (
      <PermissionDenied headingLevel="h1" action={back} />
    ) : (
      <ErrorState
        headingLevel="h1"
        requestId={result.error.requestId === 'none' ? undefined : result.error.requestId}
        action={
          <>
            <ReloadButton />
            {back}
          </>
        }
      />
    );
  }
  const group = result.data;
  return (
    <>
      <PageHeader
        title={group.name}
        description={group.branch ? g.branchScope(group.branch.name) : g.wholeOrganisation}
        meta={<StatusBadge entity="group" status={group.status} />}
        breadcrumbs={[{ label: g.title, href: '/admin/groups' }, { label: group.name }]}
      />
      {(await searchParams).created === '1' ? <FocusedNotice message={g.created} /> : null}
      {group.canManage ? null : <p className="text-sm text-muted-foreground">{g.readOnlyNote}</p>}
      <div className="grid gap-6 xl:grid-cols-2">
        <GroupDetails group={group} />
        <GroupStatusSection group={group} />
      </div>
      <GroupMembers
        // A new list state per group version (e.g. after archiving, the add panel goes away).
        key={`${group.id}:${group.version}`}
        group={group}
        initial={members}
        canSearchPeople={session.permissions.includes('user.read')}
      />
    </>
  );
}
