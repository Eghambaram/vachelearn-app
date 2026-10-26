import { BookOpen, CircleAlert, GraduationCap, ShieldCheck, Users } from 'lucide-react';
import Link from 'next/link';
import type {
  ComplianceReport,
  ComplianceStatus,
  TenantDashboard as TenantDashboardData,
} from '@vachelearn/contracts';
import { StatusBadge } from '@/components/status-badge';
import { ChartCard } from '@/components/chart-card';
import { KpiCard } from '@/components/kpi-card';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBasisPoints, formatNumber } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import { kpiChange } from '@/lib/kpi-change';
import { LearningProgressChart } from './learning-progress-chart';
import { TenantActivityFeed } from './tenant-activity';
import { UpcomingDeadlines } from './upcoming-deadlines';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const k = t.tenantDashboard.kpi;

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4';

/**
 * Tenant workspace dashboard (UI spec #15 / #31, ref 07 panel 1) for TA, BA, LM and CV. Everything is in the scope the
 * server reports in `data.scope`. Compliance shows the compliance report's totals (D-018) for the same scope, or is
 * omitted without `compliance.read`; the reference's
 * "Create" menu is omitted until there is something to create (no inert controls).
 */
export function TenantDashboard({
  data,
  demo,
  permissions,
  compliance,
}: {
  data: TenantDashboardData;
  demo: boolean;
  permissions: readonly string[];
  /** Totals from the compliance report (same session scope), or null when the role cannot read compliance. */
  compliance: ComplianceReport['totals'] | null;
}) {
  const { kpis } = data;
  const since = t.period.changeSince[data.period];
  return (
    <>
      <section className={GRID} aria-label={t.tenantDashboard.title}>
        <KpiCard
          demo={demo}
          label={k.learners}
          icon={<Users />}
          value={formatNumber(kpis.learners.value)}
          change={kpiChange(kpis.learners.value, kpis.learners.previousValue, since)}
          helper={k.learnersHelper}
        />
        <KpiCard
          demo={demo}
          label={k.courses}
          icon={<BookOpen />}
          value={formatNumber(kpis.publishedCourses.value)}
          change={kpiChange(
            kpis.publishedCourses.value,
            kpis.publishedCourses.previousValue,
            since,
          )}
          helper={k.coursesHelper}
        />
        <KpiCard
          demo={demo}
          label={k.completion}
          icon={<GraduationCap />}
          value={
            kpis.completionRate.rate === null
              ? k.noRate
              : formatBasisPoints(kpis.completionRate.rate)
          }
          helper={k.completionHelper(
            formatNumber(kpis.completionRate.completed),
            formatNumber(kpis.completionRate.enrolled),
          )}
        />
        <KpiCard
          demo={demo}
          label={k.overdue}
          icon={<CircleAlert />}
          value={formatNumber(kpis.overdueEnrollments)}
          helper={k.overdueHelper}
        />
      </section>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <LearningProgressChart data={data} demo={demo} />
        {compliance ? <ComplianceSummary totals={compliance} /> : null}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TenantActivityFeed
          events={data.activity}
          timeZone={data.timeZone}
          demo={demo}
          canViewAuditLog={permissions.includes('audit.read')}
        />
        <UpcomingDeadlines
          deadlines={data.upcomingDeadlines}
          generatedAt={data.generatedAt}
          timeZone={data.timeZone}
          demo={demo}
          canViewAssignments={permissions.includes('assignment.create')}
        />
      </div>
    </>
  );
}

const COMPLIANCE_ORDER: readonly ComplianceStatus[] = [
  'overdue',
  'due_soon',
  'not_started',
  'compliant',
  'not_applicable',
];

/** Where the reference shows compliance numbers: the report's own totals, so the two always agree. */
function ComplianceSummary({ totals }: { totals: ComplianceReport['totals'] }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
          {t.tenantDashboard.compliance.title}
        </h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col divide-y">
          {COMPLIANCE_ORDER.map((status) => (
            <li key={status} className="flex items-center justify-between gap-2 py-2 first:pt-0">
              <StatusBadge entity="compliance" status={status} />
              <span className="font-semibold tabular-nums">{totals.byStatus[status]}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          {t.tenantDashboard.compliance.total(totals.total)}
        </p>
        <Link
          href="/admin/reports/compliance"
          className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t.tenantDashboard.compliance.viewReport}
        </Link>
      </CardContent>
    </Card>
  );
}

export function TenantDashboardSkeleton() {
  return (
    <div role="status" aria-label={t.common.loading} className="flex flex-col gap-6">
      <div className={GRID}>
        {[k.learners, k.courses, k.completion, k.overdue].map((label) => (
          <KpiCard key={label} label={label} loading />
        ))}
      </div>
      <ChartCard
        headingLevel="h2"
        title={t.tenantDashboard.progress.title}
        summary=""
        table={{ columns: [], rows: [] }}
        loading
      >
        {null}
      </ChartCard>
      <Card className="px-(--card-spacing)">
        <Skeleton className="h-40 w-full" />
      </Card>
    </div>
  );
}
