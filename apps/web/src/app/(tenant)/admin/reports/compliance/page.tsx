import type { Metadata } from 'next';
import { Download } from 'lucide-react';
import { DemoBadge } from '@/components/demo-badge';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { Button } from '@/components/ui/button';
import { ComplianceReport } from '@/features/reports/compliance-report';
import { parseDemoState } from '@/lib/api/client';
import { getComplianceReport, getComplianceReportOptions } from '@/lib/api/reports';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const r = t.reports;

export const metadata: Metadata = { title: r.complianceTitle };

type Props = { searchParams: Promise<{ demoState?: string }> };

/**
 * Compliance status report (UI spec #29, ref 07; D-018, D-026). First page rendered on the server; filters, sort and
 * pages via a server action. CSV export arrives with the export pipeline (Phase 5.3); until then the button is
 * disabled with its reason written next to it, not hidden in a tooltip.
 */
export default async function ComplianceReportPage({ searchParams }: Props) {
  const session = await getSession();
  const demoState = session.demo ? parseDemoState((await searchParams).demoState) : 'ready';
  const options = await getComplianceReportOptions();
  if (!options.ok || demoState === 'forbidden') return <PermissionDenied headingLevel="h1" />;
  const initial = demoState === 'loading' ? null : await getComplianceReport({}, { demoState });
  return (
    <>
      <PageHeader
        title={r.complianceTitle}
        description={r.complianceDescription}
        breadcrumbs={[
          { label: t.nav.dashboard, href: '/admin' },
          { label: r.title, href: '/admin/reports' },
          { label: r.complianceTitle },
        ]}
        meta={session.demo ? <DemoBadge /> : null}
        actions={
          session.permissions.includes('report.export') ? (
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <Button variant="outline" disabled aria-describedby="export-note">
                <Download aria-hidden="true" />
                {r.exportCsv}
              </Button>
              <p id="export-note" className="max-w-xs text-xs text-muted-foreground sm:text-right">
                {r.exportNote}
              </p>
            </div>
          ) : null
        }
      />
      <ComplianceReport initial={initial} options={options.data} demoState={demoState} />
    </>
  );
}
