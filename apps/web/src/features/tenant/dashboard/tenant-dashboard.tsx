import { BookOpen, CircleAlert, GraduationCap, ShieldCheck, Users } from 'lucide-react';
import type { TenantDashboard as TenantDashboardData } from '@vachelearn/contracts';
import { ChartCard } from '@/components/chart-card';
import { EmptyState } from '@/components/empty-state';
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
 * server reports in `data.scope`. Compliance is a labelled placeholder until Phase 5 (D-018); the reference's
 * "Create" menu is omitted until there is something to create (no inert controls).
 */
export function TenantDashboard({
  data,
  demo,
  permissions,
}: {
  data: TenantDashboardData;
  demo: boolean;
  permissions: readonly string[];
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
        <CompliancePlaceholder />
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

/** Honest placeholder where the reference shows compliance numbers (D-018 undecided, Phase 5). */
function CompliancePlaceholder() {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold">{t.tenantDashboard.compliance.title}</h2>
      </CardHeader>
      <CardContent>
        <EmptyState
          headingLevel="h3"
          icon={<ShieldCheck />}
          title={t.placeholder.title(t.tenantDashboard.compliance.title)}
          description={t.tenantDashboard.compliance.body}
        />
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
