import { buckets, DAY, periodStartOf, zonedMidnight } from './time';
import type {
  DashboardPeriod,
  PlatformActivity,
  PlatformDashboard,
  RecentTenant,
  TenantStatus,
} from '@vachelearn/contracts';

/*
 * Phase 1 demo fixture for GET /api/v1/platform/dashboard. Fictional tenants ("Example … (Demo)"), deterministic for a
 * given `now`, and internally consistent (KPIs equal the sums of the trend series), so the screen can be reviewed
 * like real data. Replaced by the API in Phases 2.2 / 6.4; definitions in docs/METRICS.md.
 */

export const PLATFORM_REPORTING_ZONE = 'Asia/Kolkata';

const INDUSTRY_WORDS = [
  'Manufacturing',
  'Logistics',
  'Construction',
  'Energy',
  'Foods',
  'Textiles',
];

type FixtureTenant = RecentTenant & { publishedCourses: number };

function fixtureTenants(now: number): FixtureTenant[] {
  return Array.from({ length: 24 }, (_, index) => {
    const n = index + 1;
    const status: TenantStatus =
      n === 19 ? 'archived' : n === 5 || n === 13 ? 'suspended' : 'active';
    const word = INDUSTRY_WORDS[n % INDUSTRY_WORDS.length]!;
    return {
      id: `demo-tenant-${String(n).padStart(2, '0')}`,
      displayName: `Example ${word} ${String(n).padStart(2, '0')} (Demo)`,
      slug: `example-${word.toLowerCase()}-${n}`,
      status,
      learnerCount: 20 + ((n * 37) % 400),
      publishedCourses: 3 + ((n * 7) % 25),
      // Tenant 1 is the newest: 16 joined over the last ~11 months, the other 8 over the year before.
      createdAt: new Date(
        now - (n <= 16 ? n * 21 : 365 + (n - 16) * 40) * DAY - n * 3_600_000,
      ).toISOString(),
    };
  });
}

function activityFor(tenants: FixtureTenant[], now: number): PlatformActivity[] {
  const events: PlatformActivity[] = tenants.slice(0, 6).map((tenant) => ({
    id: `act-created-${tenant.id}`,
    occurredAt: tenant.createdAt,
    actorDisplayName: 'Demo Platform Admin',
    action: 'tenant.created',
    tenant: { id: tenant.id, displayName: tenant.displayName },
  }));
  const suspended = tenants.find((tenant) => tenant.status === 'suspended')!;
  events.push(
    {
      id: 'act-suspended',
      occurredAt: new Date(now - 26 * 3_600_000).toISOString(),
      actorDisplayName: 'Demo Platform Admin',
      action: 'tenant.suspended',
      tenant: { id: suspended.id, displayName: suspended.displayName },
    },
    {
      id: 'act-invited',
      occurredAt: new Date(now - 3 * 3_600_000).toISOString(),
      actorDisplayName: 'Demo Platform Admin',
      action: 'platform_user.invited',
      tenant: null,
    },
    {
      id: 'act-support',
      occurredAt: new Date(now - 50 * 60_000).toISOString(),
      actorDisplayName: 'Demo Support Engineer',
      action: 'support_session.started',
      tenant: { id: tenants[2]!.id, displayName: tenants[2]!.displayName },
    },
  );
  return events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 8);
}

export function buildPlatformDashboard(
  period: DashboardPeriod,
  now: Date,
  { empty = false }: { empty?: boolean } = {},
): PlatformDashboard {
  const nowMs = now.getTime();
  const periodStart = periodStartOf(period, nowMs);
  const granularity = period === '12m' ? 'month' : 'week';
  const tenants = empty ? [] : fixtureTenants(nowMs);
  const createdBy = (t: FixtureTenant, at: number) => Date.parse(t.createdAt) < at;
  const live = (at: number) => tenants.filter((t) => createdBy(t, at) && t.status !== 'archived');
  const learnersAt = (at: number) =>
    live(at)
      .filter((t) => t.status === 'active')
      .reduce((sum, t) => sum + t.learnerCount, 0);
  const coursesAt = (at: number) =>
    live(at)
      .filter((t) => t.status === 'active')
      .reduce((sum, t) => sum + t.publishedCourses, 0);

  const starts = empty ? [] : buckets(granularity, periodStart, nowMs);
  const ends = starts.map((_, i) =>
    i + 1 < starts.length ? zonedMidnight(starts[i + 1]!) : nowMs,
  );
  const scale = granularity === 'month' ? 4 : 1;
  const tenantGrowth = starts.map((bucketStart, i) => ({
    bucketStart,
    newTenants: tenants.filter(
      (t) => createdBy(t, ends[i]!) && !createdBy(t, zonedMidnight(bucketStart)),
    ).length,
    totalTenants: live(ends[i]!).length,
  }));
  const enrollmentTrend = starts.map((bucketStart, i) => {
    const enrollments = (120 + ((i * 53) % 90)) * scale;
    return {
      bucketStart,
      enrollments,
      completions: Math.round(enrollments * (0.58 + ((i * 7) % 20) / 100)),
    };
  });
  const enrolled = enrollmentTrend.reduce((sum, p) => sum + p.enrollments, 0);
  const completed = enrollmentTrend.reduce((sum, p) => sum + p.completions, 0);

  const count = (status: TenantStatus) => tenants.filter((t) => t.status === status).length;
  return {
    period,
    periodStart: new Date(periodStart).toISOString(),
    generatedAt: now.toISOString(),
    timeZone: PLATFORM_REPORTING_ZONE,
    kpis: {
      tenants: {
        byStatus: {
          active: count('active'),
          suspended: count('suspended'),
          archived: count('archived'),
        },
        current: { value: live(nowMs).length, previousValue: live(periodStart).length },
      },
      learners: { value: learnersAt(nowMs), previousValue: learnersAt(periodStart) },
      publishedCourses: { value: coursesAt(nowMs), previousValue: coursesAt(periodStart) },
      completionRate: {
        completed,
        enrolled,
        rate: enrolled === 0 ? null : Math.floor((completed * 10_000) / enrolled),
      },
    },
    granularity,
    tenantGrowth,
    enrollmentTrend,
    recentTenants: [...tenants]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
      .map(({ id, displayName, slug, status, learnerCount, createdAt }) => ({
        id,
        displayName,
        slug,
        status,
        learnerCount,
        createdAt,
      })),
    activity: tenants.length === 0 ? [] : activityFor(tenants, nowMs),
  };
}
