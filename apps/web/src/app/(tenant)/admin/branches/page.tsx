import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { Button } from '@/components/ui/button';
import { RealDataOnly } from '@/features/people/real-data-only';
import { BranchList } from '@/features/tenancy/branch-list';
import { readBranches } from '@/lib/api/tenancy-server';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.branches.title };

// Per request: the list comes from the API with the caller's session and scope.
export const dynamic = 'force-dynamic';

/** Branches (UI spec #16; Slice 2.5c) on the real API (2.2). The API scopes the list; the check here picks the state. */
export default async function BranchesPage() {
  const session = await getSession();
  if (session.demo) return <RealDataOnly />;
  if (!session.permissions.includes('branch.read')) return <PermissionDenied headingLevel="h1" />;
  const initial = await readBranches({ sort: 'name', direction: 'asc' });
  if (!initial.ok && initial.status === 403) return <PermissionDenied headingLevel="h1" />;
  // Shown only to Tenant Admins; the API checks `branch.create` again.
  const canCreate = session.permissions.includes('branch.create');
  return (
    <>
      <PageHeader
        title={t.branches.title}
        description={t.branches.description}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/admin/branches/new">
                <Plus aria-hidden="true" />
                {t.branches.add}
              </Link>
            </Button>
          ) : null
        }
      />
      <BranchList initial={initial} canCreate={canCreate} />
    </>
  );
}
