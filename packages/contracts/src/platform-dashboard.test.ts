import { ApiErrorBody, BasisPoints } from './common';
import { PlatformDashboard, PlatformDashboardQuery } from './platform-dashboard';

const valid = {
  period: '30d',
  periodStart: '2026-09-20T00:00:00.000Z',
  generatedAt: '2026-10-20T09:30:00.000Z',
  timeZone: 'Asia/Kolkata',
  kpis: {
    tenants: {
      byStatus: { active: 20, suspended: 2, archived: 1 },
      current: { value: 22, previousValue: 20 },
    },
    learners: { value: 1200, previousValue: 1100 },
    publishedCourses: { value: 300, previousValue: 280 },
    completionRate: { completed: 74, enrolled: 100, rate: 7400 },
  },
  granularity: 'week',
  tenantGrowth: [{ bucketStart: '2026-09-21', newTenants: 1, totalTenants: 21 }],
  enrollmentTrend: [{ bucketStart: '2026-09-21', enrollments: 40, completions: 12 }],
  recentTenants: [
    {
      id: 't1',
      displayName: 'Example Tenant',
      slug: 'example',
      status: 'active',
      learnerCount: 12,
      createdAt: '2026-10-01T04:00:00.000Z',
    },
  ],
  activity: [
    {
      id: 'a1',
      occurredAt: '2026-10-19T04:00:00.000Z',
      actorDisplayName: 'Demo User',
      action: 'tenant.created',
      tenant: { id: 't1', displayName: 'Example Tenant' },
    },
  ],
};

describe('PlatformDashboard contract', () => {
  it('accepts a well-formed response', () => {
    expect(PlatformDashboard.parse(valid)).toEqual(valid);
  });

  it('rejects floats, negative counts and out-of-range rates (money/rates are integers)', () => {
    const bad = structuredClone(valid);
    bad.kpis.learners.value = 12.5;
    expect(PlatformDashboard.safeParse(bad).success).toBe(false);
    expect(BasisPoints.safeParse(10_001).success).toBe(false);
    expect(BasisPoints.safeParse(-1).success).toBe(false);
  });

  it('only allows domain tenant statuses (D-066: no "trial")', () => {
    const bad = structuredClone(valid);
    (bad.recentTenants[0] as { status: string }).status = 'trial';
    expect(PlatformDashboard.safeParse(bad).success).toBe(false);
  });

  it('requires UTC instants and plain calendar dates', () => {
    const bad = structuredClone(valid);
    bad.generatedAt = '2026-10-20 09:30';
    expect(PlatformDashboard.safeParse(bad).success).toBe(false);
    const badDate = structuredClone(valid);
    badDate.tenantGrowth[0]!.bucketStart = '2026-09-21T00:00:00Z';
    expect(PlatformDashboard.safeParse(badDate).success).toBe(false);
  });

  it('caps the recent-tenant and activity lists', () => {
    const bad = structuredClone(valid);
    bad.recentTenants = Array.from({ length: 6 }, () => valid.recentTenants[0]!);
    expect(PlatformDashboard.safeParse(bad).success).toBe(false);
  });
});

describe('PlatformDashboardQuery', () => {
  it('defaults to 30 days and rejects unknown periods', () => {
    expect(PlatformDashboardQuery.parse({})).toEqual({ period: '30d' });
    expect(PlatformDashboardQuery.safeParse({ period: '7y' }).success).toBe(false);
  });
});

describe('ApiErrorBody', () => {
  it('matches the error envelope', () => {
    expect(
      ApiErrorBody.safeParse({ error: { code: 'forbidden', message: 'No', requestId: 'r1' } })
        .success,
    ).toBe(true);
    expect(ApiErrorBody.safeParse({ code: 'forbidden' }).success).toBe(false);
  });
});
