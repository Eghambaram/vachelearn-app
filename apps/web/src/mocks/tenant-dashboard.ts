import type {
  DashboardPeriod,
  TenantActivity,
  TenantActivityAction,
  TenantDashboard,
  UpcomingDeadline,
} from '@vachelearn/contracts';
import { DEMO_BRANCHES, demoBranchId } from './demo-session';
import { buckets, DAY, periodStartOf, zonedDate, zonedMidnight } from './time';

/*
 * Phase 1 demo fixture for GET /api/v1/dashboard (tenant workspace). Every figure is produced per branch and then
 * filtered to the caller's branch scope, exactly as the API will scope its queries (D-026), so a Branch Admin's
 * dashboard is visibly smaller than the Tenant Admin's. Deterministic for a given tenant and `now`. Course titles and
 * people are fictional. Replaced by the API in Phases 4.7 / 5.2; definitions in docs/METRICS.md (tenant.*).
 */

export const DEMO_TENANT_ZONE = 'Asia/Kolkata';

type BranchKey = (typeof DEMO_BRANCHES)[number]['key'];

const COURSES = [
  'Fire Safety Refresher (Demo)',
  'Forklift Operation Basics (Demo)',
  'PPE and Equipment (Demo)',
  'Hazard Identification (Demo)',
  'Machine Guarding (Demo)',
  'First Aid Essentials (Demo)',
];

const BRANCH_FIXTURE: Record<
  BranchKey,
  {
    learners: number;
    growthPer30d: number;
    weeklyEnrollments: number;
    overdue: number;
    /** [course index, due in N days, learners outstanding] */
    deadlines: [number, number, number][];
  }
> = {
  a1: {
    learners: 214,
    growthPer30d: 12,
    weeklyEnrollments: 60,
    overdue: 9,
    deadlines: [
      [0, 3, 8],
      [2, 9, 5],
      [4, 16, 6],
    ],
  },
  a2: {
    learners: 168,
    growthPer30d: 9,
    weeklyEnrollments: 45,
    overdue: 14,
    deadlines: [
      [1, 5, 12],
      [0, 3, 6],
      [3, 21, 4],
    ],
  },
  hq: {
    learners: 96,
    growthPer30d: 4,
    weeklyEnrollments: 25,
    overdue: 3,
    deadlines: [
      [2, 9, 3],
      [5, 27, 2],
    ],
  },
};

const PERIOD_MONTHS: Record<DashboardPeriod, number> = { '30d': 1, '90d': 3, '12m': 12 };

type FixtureEvent = TenantActivity & { branch: BranchKey | null };

function events(now: number): FixtureEvent[] {
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  const e = (
    id: string,
    minutesAgo: number,
    branch: BranchKey | null,
    action: TenantActivityAction,
    actorDisplayName: string,
    subject: string,
  ): FixtureEvent => ({
    id,
    occurredAt: at(minutesAgo),
    branch,
    action,
    actorDisplayName,
    subject,
  });
  return [
    e('e1', 95, 'a1', 'membership.activated', 'Example Learner 31', 'Example Branch A1'),
    e('e2', 240, null, 'course.published', 'Demo Tenant Admin', COURSES[5]!),
    e('e3', 300, 'a2', 'enrollment.completed', 'Example Learner 12', COURSES[0]!),
    e('e4', 410, 'a1', 'certificate.issued', 'Example Learner 08', COURSES[2]!),
    e('e5', 1_380, 'hq', 'group.created', 'Demo Learning Manager', 'Example Night Shift Group'),
    e('e6', 1_500, 'a2', 'assignment.created', 'Demo Learning Manager', COURSES[1]!),
    e('e7', 2_900, 'a1', 'enrollment.completed', 'Example Learner 22', COURSES[3]!),
    e('e8', 3_100, 'a2', 'membership.activated', 'Example Learner 40', 'Example Branch A2'),
    e('e9', 4_400, 'hq', 'certificate.issued', 'Example Learner 03', COURSES[5]!),
    e('e10', 5_000, 'a1', 'assignment.created', 'Demo Branch Admin', COURSES[4]!),
  ];
}

export function buildTenantDashboard(
  period: DashboardPeriod,
  now: Date,
  {
    tenantId,
    branchScope,
    empty = false,
  }: {
    tenantId: string;
    /** Branch ids the caller is limited to, or null for the whole tenant (from the session, never the request). */
    branchScope: readonly { id: string; name: string }[] | null;
    empty?: boolean;
  },
): TenantDashboard {
  const nowMs = now.getTime();
  const periodStart = periodStartOf(period, nowMs);
  const granularity = period === '12m' ? 'month' : 'week';
  // The second demo tenant is smaller, so switching tenants visibly changes the numbers.
  const size = tenantId === 'demo-tenant-2' ? 0.6 : 1;
  const inScope = (key: BranchKey) =>
    branchScope === null || branchScope.some((b) => b.id === demoBranchId(tenantId, key));
  const branches = empty ? [] : DEMO_BRANCHES.map((b) => b.key).filter(inScope);
  const sum = (f: (key: BranchKey) => number) => branches.reduce((total, key) => total + f(key), 0);

  const learners = sum((k) => Math.round(BRANCH_FIXTURE[k].learners * size));
  const learnerGrowth = sum((k) =>
    Math.round(BRANCH_FIXTURE[k].growthPer30d * size * PERIOD_MONTHS[period]),
  );
  const courses = empty ? 0 : Math.round(42 * size);

  const starts = empty ? [] : buckets(granularity, periodStart, nowMs);
  const learningProgress = starts.map((bucketStart, i) => {
    const enrollments = sum(
      (k) =>
        Math.round(BRANCH_FIXTURE[k].weeklyEnrollments * size) * (granularity === 'month' ? 4 : 1) +
        ((i * 13) % 20),
    );
    return {
      bucketStart,
      enrollments,
      completions: Math.round(enrollments * (0.55 + ((i * 7) % 20) / 100)),
    };
  });
  const enrolled = learningProgress.reduce((s, p) => s + p.enrollments, 0);
  const completed = learningProgress.reduce((s, p) => s + p.completions, 0);

  const deadlineMap = new Map<string, UpcomingDeadline>();
  for (const key of branches) {
    for (const [course, inDays, outstanding] of BRANCH_FIXTURE[key].deadlines) {
      const dueOn = zonedDate(zonedMidnight(zonedDate(nowMs)) + inDays * DAY);
      const id = `${tenantId}-course-${course}`;
      const existing = deadlineMap.get(`${id}|${dueOn}`);
      const learnersOutstanding = Math.max(1, Math.round(outstanding * size));
      deadlineMap.set(`${id}|${dueOn}`, {
        courseId: id,
        courseTitle: COURSES[course]!,
        dueOn,
        learnersOutstanding: (existing?.learnersOutstanding ?? 0) + learnersOutstanding,
      });
    }
  }

  return {
    period,
    periodStart: new Date(periodStart).toISOString(),
    generatedAt: now.toISOString(),
    timeZone: DEMO_TENANT_ZONE,
    scope:
      branchScope === null
        ? { kind: 'tenant' }
        : { kind: 'branches', branches: branchScope.map((b) => ({ id: b.id, name: b.name })) },
    kpis: {
      learners: { value: learners, previousValue: Math.max(0, learners - learnerGrowth) },
      publishedCourses: {
        value: courses,
        previousValue: Math.max(0, courses - PERIOD_MONTHS[period]),
      },
      completionRate: {
        completed,
        enrolled,
        rate: enrolled === 0 ? null : Math.floor((completed * 10_000) / enrolled),
      },
      overdueEnrollments: sum((k) => Math.round(BRANCH_FIXTURE[k].overdue * size)),
    },
    granularity,
    learningProgress,
    upcomingDeadlines: [...deadlineMap.values()]
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.courseTitle.localeCompare(b.courseTitle))
      .slice(0, 5),
    activity: empty
      ? []
      : events(nowMs)
          .filter((event) => event.branch === null || branches.includes(event.branch))
          .slice(0, 8)
          .map(({ id, occurredAt, actorDisplayName, action, subject }) => ({
            id,
            occurredAt,
            actorDisplayName,
            action,
            subject,
          })),
  };
}
