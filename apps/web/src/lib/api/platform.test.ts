import { getPlatformDashboard } from './platform';

// Fixed clock (testing rules): 20 Oct 2026, 15:00 IST.
const NOW = new Date('2026-10-20T09:30:00.000Z');

async function dashboard(period: string, demoState?: 'empty' | 'error' | 'forbidden') {
  const result = await getPlatformDashboard({ period }, { now: NOW, demoState });
  return result;
}

describe('getPlatformDashboard (demo layer through the shared contract)', () => {
  it('cuts weekly buckets for 30/90 days and monthly for 12 months', async () => {
    const d30 = await dashboard('30d');
    const d12m = await dashboard('12m');
    if (!d30.ok || !d12m.ok) throw new Error('expected data');
    expect(d30.data.granularity).toBe('week');
    expect(d30.data.tenantGrowth.length).toBeGreaterThanOrEqual(5);
    expect(new Date(`${d30.data.tenantGrowth[0]!.bucketStart}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(d12m.data.granularity).toBe('month');
    expect(d12m.data.tenantGrowth.map((p) => p.bucketStart.slice(8))).toEqual(
      Array(d12m.data.tenantGrowth.length).fill('01'),
    );
    expect(d12m.data.tenantGrowth.at(-1)!.bucketStart).toBe('2026-10-01');
  });

  it('keeps KPIs consistent with the series they summarise (D-065)', async () => {
    const result = await dashboard('90d');
    if (!result.ok) throw new Error('expected data');
    const { kpis, enrollmentTrend, tenantGrowth } = result.data;
    const enrolled = enrollmentTrend.reduce((s, p) => s + p.enrollments, 0);
    const completed = enrollmentTrend.reduce((s, p) => s + p.completions, 0);
    expect(kpis.completionRate).toEqual({
      enrolled,
      completed,
      rate: Math.floor((completed * 10_000) / enrolled),
    });
    expect(tenantGrowth.at(-1)!.totalTenants).toBe(kpis.tenants.current.value);
    const { active, suspended } = kpis.tenants.byStatus;
    expect(kpis.tenants.current.value).toBe(active + suspended);
  });

  it('a longer period starts earlier and counts fewer tenants at its start', async () => {
    const d30 = await dashboard('30d');
    const d12m = await dashboard('12m');
    if (!d30.ok || !d12m.ok) throw new Error('expected data');
    expect(Date.parse(d12m.data.periodStart)).toBeLessThan(Date.parse(d30.data.periodStart));
    expect(d12m.data.kpis.tenants.current.previousValue).toBeLessThan(
      d30.data.kpis.tenants.current.previousValue,
    );
  });

  it('lists the five newest tenants and at most eight activity events, newest first', async () => {
    const result = await dashboard('30d');
    if (!result.ok) throw new Error('expected data');
    const created = result.data.recentTenants.map((t) => t.createdAt);
    expect(created).toHaveLength(5);
    expect([...created].sort().reverse()).toEqual(created);
    const times = result.data.activity.map((a) => a.occurredAt);
    expect(times.length).toBeLessThanOrEqual(8);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('empty state has no series and no rate (never 0%)', async () => {
    const result = await dashboard('30d', 'empty');
    if (!result.ok) throw new Error('expected data');
    expect(result.data.kpis.completionRate.rate).toBeNull();
    expect(result.data.tenantGrowth).toEqual([]);
    expect(result.data.recentTenants).toEqual([]);
  });

  it('returns the error envelope for forbidden, failed and invalid requests', async () => {
    const forbidden = await dashboard('30d', 'forbidden');
    const failed = await dashboard('30d', 'error');
    const invalid = await dashboard('7y');
    expect(forbidden).toMatchObject({ ok: false, status: 403 });
    expect(failed).toMatchObject({
      ok: false,
      status: 500,
      error: { requestId: expect.any(String) },
    });
    expect(invalid).toMatchObject({
      ok: false,
      status: 422,
      error: { fieldErrors: [expect.objectContaining({ field: 'period' })] },
    });
  });
});
