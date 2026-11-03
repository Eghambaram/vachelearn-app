import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { RealDataOnly } from '@/features/people/real-data-only';
import { NewBranch } from '@/features/tenancy/new-branch';
import { readTenantSettings } from '@/lib/api/tenancy-server';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.branches.newTitle };

export const dynamic = 'force-dynamic';

/** Add a branch (UI spec #16): Tenant Admins (`branch.create`); the organisation's time zone is preselected. */
export default async function NewBranchPage() {
  const session = await getSession();
  if (session.demo) return <RealDataOnly />;
  if (!session.permissions.includes('branch.create')) return <PermissionDenied headingLevel="h1" />;
  const settings = await readTenantSettings();
  return (
    <>
      <PageHeader
        title={t.branches.newTitle}
        breadcrumbs={[
          { label: t.branches.title, href: '/admin/branches' },
          { label: t.branches.newTitle },
        ]}
      />
      <NewBranch defaultTimezone={settings.ok ? settings.data.defaultTimezone : undefined} />
    </>
  );
}
