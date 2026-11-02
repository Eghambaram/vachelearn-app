import type { Metadata } from 'next';
import Link from 'next/link';
import type { TenantRoleKey } from '@vachelearn/contracts';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { ReloadButton } from '@/components/reload-button';
import { StatusBadge } from '@/components/status-badge';
import { PersonBranches } from '@/features/people/person-branches';
import { PersonProfile } from '@/features/people/person-profile';
import { PersonRoles, type RoleRow } from '@/features/people/person-roles';
import { PersonStatus } from '@/features/people/person-status';
import { RealDataOnly } from '@/features/people/real-data-only';
import {
  readBranchOptions,
  readJobRoleOptions,
  readPerson,
  readRoleAssignments,
} from '@/lib/api/people-server';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const p = t.people;

export const metadata: Metadata = { title: p.detailTitle };

// Per request: the member comes from the API with the caller's session and scope.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BRANCH_ADMIN_ROLES: readonly TenantRoleKey[] = ['learner', 'instructor'];
const ALL_ROLES: readonly TenantRoleKey[] = [
  'tenant_admin',
  'branch_admin',
  'learning_manager',
  'compliance_viewer',
  'instructor',
  'learner',
];

type Props = { params: Promise<{ membershipId: string }> };

/**
 * One user (UI spec #17; Slice 2.5b): the organisation's fields (D-047), status (D-102), branches (D-026, D-104) and
 * roles (D-107). What is offered follows the caller's permissions and the API's `canManage` (D-101); the API checks
 * every change again. A member the caller cannot see is "not found" — never "forbidden" (existence never leaks).
 */
export default async function UserPage({ params }: Props) {
  const session = await getSession();
  if (session.demo) return <RealDataOnly />;
  const perms = new Set(session.permissions);
  if (!perms.has('user.read')) return <PermissionDenied headingLevel="h1" />;
  const { membershipId } = await params;
  const back = (
    <Link
      href="/admin/users"
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      {p.backToUsers}
    </Link>
  );
  const result = UUID.test(membershipId) ? await readPerson(membershipId) : null;
  if (!result || (!result.ok && result.status === 404)) {
    return (
      <EmptyState
        headingLevel="h1"
        title={p.notFoundTitle}
        description={p.notFoundBody}
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
  const person = result.data;
  // "Is this me": the session's own membership of the active organisation (never compared by email).
  const ownMembership = session.memberships.find((m) => m.tenantId === session.activeTenantId);
  const self = ownMembership?.membershipId === person.membershipId;
  const active = person.status === 'active';
  // Only a Tenant Admin holds `reference_data.manage`: a hint for which roles and scopes to offer (the API decides).
  const tenantWide = perms.has('reference_data.manage');
  const mayAssign =
    perms.has('role.assign') && !self && active && person.accountStatus === 'active';
  const [assignments, branches, jobRoles] = await Promise.all([
    perms.has('role.assign') && !self ? readRoleAssignments(membershipId) : null,
    (perms.has('membership.branch.manage') && person.canManage) || mayAssign
      ? readBranchOptions()
      : null,
    perms.has('user.update') && person.canManage ? readJobRoleOptions() : null,
  ]);
  const branchOptions = branches?.ok
    ? branches.data.data.map((b) => ({ id: b.id, label: `${b.name} (${b.code})` }))
    : [];
  // What the caller may revoke: its assignments list (a Branch Admin only Learner/Instructor, D-101/2.4b); every other
  // role the member holds is shown read-only — whole-organisation roles included, which the assignments list leaves
  // out for branch-scoped callers.
  const revocable = (role: TenantRoleKey) => tenantWide || BRANCH_ADMIN_ROLES.includes(role);
  const listed = assignments?.ok ? assignments.data.data : [];
  const roleRows: RoleRow[] = person.roles.map((r) => {
    const match = listed.find(
      (a) => a.role === r.role && (a.branch?.id ?? null) === (r.branch?.id ?? null),
    );
    return {
      // Revoking stays possible for a deactivated member (cleaning up); assigning does not.
      assignmentId: match && !self && revocable(r.role) ? match.id : null,
      key: `${r.role}:${r.branch?.id ?? 'all'}`,
      role: r.role,
      branch: r.branch,
    };
  });
  // A Branch Admin assigns only on the member's own branches that it manages (2.4b); a Tenant Admin on any branch.
  const scopeOptions = tenantWide
    ? branchOptions
    : branchOptions.filter((b) => person.branches.some((own) => own.id === b.id));
  const rolesUnavailable = mayAssign && (!assignments?.ok || !branches?.ok);
  const note = self
    ? p.selfNote
    : !person.canManage && perms.has('user.update')
      ? p.outsideScopeNote
      : !person.canManage
        ? p.readOnlyNote
        : null;
  const visibleBranches = person.branches.length;

  return (
    <>
      <PageHeader
        title={person.displayName}
        description={<span className="break-all">{person.email}</span>}
        meta={<StatusBadge entity="member" status={person.status} />}
        breadcrumbs={[{ label: p.title, href: '/admin/users' }, { label: person.displayName }]}
      />
      {note ? <p className="max-w-2xl text-sm text-muted-foreground">{note}</p> : null}
      {!person.accountVerified || person.accountStatus === 'deactivated' ? (
        <p className="text-sm">
          {p.account}:{' '}
          {person.accountStatus === 'deactivated' ? p.accountDeactivated : p.accountNotVerified}
        </p>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <PersonProfile
          person={person}
          editable={person.canManage && perms.has('user.update')}
          jobRoles={
            jobRoles?.ok ? jobRoles.data.data.map((r) => ({ id: r.id, label: r.name })) : []
          }
        />
        <PersonStatus
          person={person}
          canDeactivate={person.canManage && perms.has('user.deactivate')}
          canReactivate={person.canManage && perms.has('user.reactivate')}
        />
        <PersonBranches
          person={person}
          manageable={person.canManage && active && perms.has('membership.branch.manage')}
          branchOptions={branchOptions}
          optionsUnavailable={branches !== null && !branches.ok}
          leavesScopeOnRemove={!tenantWide && visibleBranches === 1}
          inactiveNote={
            !active && person.canManage && perms.has('membership.branch.manage')
              ? p.deactivatedSectionNote
              : null
          }
        />
        <PersonRoles
          displayName={person.displayName}
          membershipId={person.membershipId}
          rows={roleRows}
          canAssign={mayAssign && !rolesUnavailable}
          assignableRoles={tenantWide ? ALL_ROLES : BRANCH_ADMIN_ROLES}
          scopeOptions={scopeOptions}
          wholeOrganisation={tenantWide}
          note={
            !perms.has('role.assign') || self
              ? null
              : !active
                ? p.deactivatedSectionNote
                : person.accountStatus !== 'active'
                  ? p.accountCannotHoldRoles
                  : rolesUnavailable
                    ? p.rolesUnavailable
                    : null
          }
        />
      </div>
    </>
  );
}
