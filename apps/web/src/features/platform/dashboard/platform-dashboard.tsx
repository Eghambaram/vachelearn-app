import { Award, BookOpen, Building2, Users } from 'lucide-react';
import type { PlatformDashboard as PlatformDashboardData } from '@vachelearn/contracts';
import { ChartCard } from '@/components/chart-card';
import { KpiCard } from '@/components/kpi-card';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBasisPoints, formatNumber } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import { ActivityFeed } from './activity-feed';
import { EnrollmentTrendChart, TenantGrowthChart, TenantStatusChart } from './dashboard-charts';
import { kpiChange } from './kpi-change';
import { RecentTenants } from './recent-tenants';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const k = t.platformDashboard.kpi;

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4';

/**
 * Platform Admin dashboard body (UI spec #7, ref 01-final). Renders only what the server computed. Omitted until
 * decided: revenue/plan widgets and expiring subscriptions (D-027), top industries (D-048).
 */
export function PlatformDashboard({ data, demo }: { data: PlatformDashboardData; demo: boolean }) {
  const { kpis } = data;
  const since = t.platformDashboard.changeSince[data.period];
  return (
    <>
      <section className={GRID} aria-label={t.platformDashboard.title}>
        <KpiCard
          demo={demo}
          label={k.tenants}
          icon={<Building2 />}
          value={formatNumber(kpis.tenants.current.value)}
          change={kpiChange(kpis.tenants.current.value, kpis.tenants.current.previousValue, since)}
          helper={k.tenantsHelper(kpis.tenants.byStatus.active, kpis.tenants.byStatus.suspended)}
        />
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
          icon={<Award />}
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
      </section>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TenantGrowthChart data={data} demo={demo} />
        <EnrollmentTrendChart data={data} demo={demo} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <TenantStatusChart data={data} demo={demo} />
        <ActivityFeed events={data.activity} timeZone={data.timeZone} demo={demo} />
      </div>
      <RecentTenants tenants={data.recentTenants} timeZone={data.timeZone} demo={demo} />
    </>
  );
}

/** Same layout while the dashboard loads, so nothing jumps when it arrives. */
export function PlatformDashboardSkeleton() {
  return (
    <div role="status" aria-label={t.common.loading} className="flex flex-col gap-6">
      <div className={GRID}>
        {[k.tenants, k.learners, k.courses, k.completion].map((label) => (
          <KpiCard key={label} label={label} loading />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {[t.platformDashboard.charts.growthTitle, t.platformDashboard.charts.enrollTitle].map(
          (title) => (
            <ChartCard
              key={title}
              headingLevel="h2"
              title={title}
              summary=""
              table={{ columns: [], rows: [] }}
              loading
            >
              {null}
            </ChartCard>
          ),
        )}
      </div>
      <Card className="px-(--card-spacing)">
        <Skeleton className="h-40 w-full" />
      </Card>
    </div>
  );
}
