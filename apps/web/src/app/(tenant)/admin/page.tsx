import { ReloadButton } from '@/components/reload-button';
import type { Metadata } from 'next';
import { DashboardPeriod } from '@vachelearn/contracts';
import { DemoBadge } from '@/components/demo-badge';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { PeriodFilter } from '@/components/period-filter';
import { PermissionDenied } from '@/components/permission-denied';
import {
  TenantDashboard,
  TenantDashboardSkeleton,
} from '@/features/tenant/dashboard/tenant-dashboard';
import { parseDemoState } from '@/lib/api/client';
import { getSession } from '@/lib/api/session';
import { getComplianceReport } from '@/lib/api/reports';
import { getTenantDashboard } from '@/lib/api/tenant';
import { formatDateTime } from '@/lib/format';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.tenantDashboard.title };

type Props = { searchParams: Promise<{ period?: string; demoState?: string }> };

/** Tenant workspace dashboard (UI spec #15, #31). Scope comes from the session; the page only shows it. */
export default async function TenantDashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();
  const period = DashboardPeriod.catch('30d').parse(params.period);
  const demoState = session.demo ? parseDemoState(params.demoState) : 'ready';

  const header = (description?: string) => (
    <PageHeader
      title={t.tenantDashboard.title}
      description={description}
      meta={session.demo ? <DemoBadge /> : null}
      actions={<PeriodFilter value={period} />}
    />
  );

  if (!session.permissions.includes('report.read')) {
    return <PermissionDenied headingLevel="h1" />;
  }
  if (demoState === 'loading') {
    return (
      <>
        {header()}
        <TenantDashboardSkeleton />
      </>
    );
  }

  const [result, compliance] = await Promise.all([
    getTenantDashboard({ period }, { demoState }),
    // Same session scope as the report itself; roles without compliance.read get no card.
    session.permissions.includes('compliance.read') ? getComplianceReport({ limit: 1 }) : null,
  ]);
  if (!result.ok) {
    return result.status === 403 ? (
      <PermissionDenied headingLevel="h1" />
    ) : (
      <>
        {header()}
        <ErrorState requestId={result.error.requestId} action={<ReloadButton />} />
      </>
    );
  }
  const { data } = result;
  const scope =
    data.scope.kind === 'tenant'
      ? t.tenantDashboard.scopeTenant
      : t.tenantDashboard.scopeBranches(data.scope.branches.map((b) => b.name).join(', '));
  return (
    <>
      {header(
        `${scope} · ${t.tenantDashboard.asOf(formatDateTime(data.generatedAt, { timeZone: data.timeZone }))}`,
      )}
      <TenantDashboard
        data={data}
        demo={session.demo}
        permissions={session.permissions}
        compliance={compliance?.ok ? compliance.data.totals : null}
      />
    </>
  );
}
