import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { FocusedNotice } from '@/components/focused-notice';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { ReloadButton } from '@/components/reload-button';
import { StatusBadge } from '@/components/status-badge';
import { RealDataOnly } from '@/features/people/real-data-only';
import { BranchDetails, BranchStatusSection } from '@/features/tenancy/branch-detail';
import { readBranch } from '@/lib/api/tenancy-server';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const b = t.branches;

export const metadata: Metadata = { title: b.detailsTitle };

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * One branch (UI spec #16): details (edit: `branch.update`) and status (`branch.deactivate`). A branch the caller
 * cannot see is "not found" — never "forbidden" (the API answers 404; existence never leaks).
 */
export default async function BranchPage({ params, searchParams }: Props) {
  const session = await getSession();
  if (session.demo) return <RealDataOnly />;
  const perms = new Set(session.permissions);
  if (!perms.has('branch.read')) return <PermissionDenied headingLevel="h1" />;
  const { branchId } = await params;
  const back = (
    <Link
      href="/admin/branches"
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      {b.backToBranches}
    </Link>
  );
  const result = UUID.test(branchId) ? await readBranch(branchId) : null;
  if (!result || (!result.ok && result.status === 404)) {
    return (
      <EmptyState
        headingLevel="h1"
        title={b.notFoundTitle}
        description={b.notFoundBody}
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
  const branch = result.data;
  const editable = perms.has('branch.update');
  return (
    <>
      <PageHeader
        title={branch.name}
        description={branch.code}
        meta={<StatusBadge entity="branch" status={branch.status} />}
        breadcrumbs={[{ label: b.title, href: '/admin/branches' }, { label: branch.name }]}
      />
      {(await searchParams).created === '1' ? <FocusedNotice message={b.created} /> : null}
      {editable ? null : <p className="text-sm text-muted-foreground">{b.readOnlyNote}</p>}
      <div className="grid gap-6 xl:grid-cols-2">
        <BranchDetails branch={branch} editable={editable} />
        <BranchStatusSection branch={branch} manageable={perms.has('branch.deactivate')} />
      </div>
      {perms.has('user.read') ? (
        <p className="text-sm">
          <Link
            href="/admin/users"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {b.peopleLink}
          </Link>
        </p>
      ) : null}
    </>
  );
}
