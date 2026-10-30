import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardList, FileBarChart } from 'lucide-react';
import { DemoBadge } from '@/components/demo-badge';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { Card } from '@/components/ui/card';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';
import { notAvailableForRealSession } from '@/components/shell/workspace';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const r = t.reports;

export const metadata: Metadata = { title: r.title };

/**
 * Reports index (UI spec #29). Lists only the reports this role may open — the report itself re-checks on the server.
 * More reports (progress, completion, expiring certificates, branch comparison) are added when built, not before.
 */
export default async function ReportsPage() {
  // Real sessions never see the Phase 1 demo data on this screen (D-097).
  const notAvailable = await notAvailableForRealSession('/admin/reports');
  if (notAvailable) return notAvailable;
  const session = await getSession();
  if (!session.permissions.includes('report.read')) return <PermissionDenied headingLevel="h1" />;
  const canCompliance = session.permissions.includes('compliance.read');
  return (
    <>
      <PageHeader
        title={r.title}
        description={r.description}
        meta={session.demo ? <DemoBadge /> : null}
      />
      {canCompliance ? (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <li>
            <Card className="h-full px-(--card-spacing)">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <ClipboardList aria-hidden="true" className="size-5 text-primary" />
                {r.complianceTitle}
              </h2>
              <p className="text-sm text-muted-foreground">{r.complianceSummary}</p>
              <Link
                href="/admin/reports/compliance"
                className="mt-auto w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {r.open}
                <span className="sr-only"> ({r.complianceTitle})</span>
              </Link>
            </Card>
          </li>
        </ul>
      ) : (
        <EmptyState icon={<FileBarChart />} title={r.noneTitle} description={r.noneBody} />
      )}
    </>
  );
}
