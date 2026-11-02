import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { PeopleList } from '@/features/people/people-list';
import { RemovedNotice } from '@/features/people/removed-notice';
import { RealDataOnly } from '@/features/people/real-data-only';
import { readBranchOptions, readJobRoleOptions, readPeople } from '@/lib/api/people-server';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.people.title };

// Per request: the list comes from the API with the caller's session and scope.
export const dynamic = 'force-dynamic';

/**
 * Users (UI spec #17, #31; Slice 2.5b) on the real API. The first page renders on the server; filters, sorting and
 * paging ask the API again from the browser. The API applies tenant and branch scope (D-026); the permission check
 * here only picks the state to show.
 */
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function UsersPage({ searchParams }: Props) {
  const session = await getSession();
  if (session.demo) return <RealDataOnly />;
  if (!session.permissions.includes('user.read')) return <PermissionDenied headingLevel="h1" />;
  const [initial, branches, jobRoles] = await Promise.all([
    readPeople(),
    session.permissions.includes('branch.read') ? readBranchOptions() : null,
    session.permissions.includes('tenant_settings.read') ? readJobRoleOptions() : null,
  ]);
  if (!initial.ok && initial.status === 403) return <PermissionDenied headingLevel="h1" />;
  return (
    <>
      <PageHeader title={t.people.title} description={t.people.description} />
      {(await searchParams).removed === '1' ? <RemovedNotice /> : null}
      <PeopleList
        emptyDescription={
          // Instructors read only their own learners, assigned with class sessions (matrix `A`).
          session.permissions.includes('branch.read')
            ? t.people.emptyDescription
            : t.people.emptyInstructorDescription
        }
        initial={initial}
        branches={
          branches?.ok
            ? branches.data.data.map((b) => ({ id: b.id, label: `${b.name} (${b.code})` }))
            : []
        }
        jobRoles={jobRoles?.ok ? jobRoles.data.data.map((r) => ({ id: r.id, label: r.name })) : []}
      />
    </>
  );
}
