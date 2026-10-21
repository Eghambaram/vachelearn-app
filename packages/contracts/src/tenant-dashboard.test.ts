import { TenantDashboard, TenantDashboardQuery } from './tenant-dashboard';

const valid = {
  period: '30d',
  periodStart: '2026-09-20T00:00:00.000Z',
  generatedAt: '2026-10-20T09:30:00.000Z',
  timeZone: 'Asia/Kolkata',
  scope: { kind: 'branches', branches: [{ id: 'b1', name: 'Example Branch A1' }] },
  kpis: {
    learners: { value: 120, previousValue: 110 },
    publishedCourses: { value: 30, previousValue: 28 },
    completionRate: { completed: 0, enrolled: 0, rate: null },
    overdueEnrollments: 4,
  },
  granularity: 'week',
  learningProgress: [{ bucketStart: '2026-09-21', enrollments: 10, completions: 4 }],
  upcomingDeadlines: [
    { courseId: 'c1', courseTitle: 'Example course', dueOn: '2026-10-25', learnersOutstanding: 3 },
  ],
  activity: [
    {
      id: 'a1',
      occurredAt: '2026-10-19T04:00:00.000Z',
      actorDisplayName: 'Demo User',
      action: 'course.published',
      subject: 'Example course',
    },
  ],
};

describe('TenantDashboard contract', () => {
  it('accepts a branch-scoped response with no rate when nothing was enrolled', () => {
    expect(TenantDashboard.parse(valid)).toEqual(valid);
  });

  it('accepts a whole-tenant scope and rejects an empty branch list', () => {
    expect(TenantDashboard.safeParse({ ...valid, scope: { kind: 'tenant' } }).success).toBe(true);
    expect(
      TenantDashboard.safeParse({ ...valid, scope: { kind: 'branches', branches: [] } }).success,
    ).toBe(false);
  });

  it('requires calendar due dates, not instants', () => {
    const bad = structuredClone(valid);
    bad.upcomingDeadlines[0]!.dueOn = '2026-10-25T00:00:00Z';
    expect(TenantDashboard.safeParse(bad).success).toBe(false);
  });

  it('has no tenant or branch input on the query (scope comes from the session)', () => {
    expect(TenantDashboardQuery.parse({ period: '90d', tenantId: 'x', branchId: 'y' })).toEqual({
      period: '90d',
    });
  });
});
