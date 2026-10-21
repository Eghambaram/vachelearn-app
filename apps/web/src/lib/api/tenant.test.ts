import type { RoleKey } from './session-types';
import { buildDemoSession } from '@/mocks/demo-session';

// The session is the only source of tenant and branch scope; tests swap it like a login would.
let current = buildDemoSession('tenant_admin', 'demo-tenant-1');
vi.mock('./session', () => ({ getSession: async () => current }));

const { getTenantDashboard } = await import('./tenant');

// Fixed clock (testing rules): 20 Oct 2026, 15:00 IST.
const NOW = new Date('2026-10-20T09:30:00.000Z');

async function dashboardAs(role: RoleKey, tenantId = 'demo-tenant-1', query: object = {}) {
  current = buildDemoSession(role, tenantId);
  const result = await getTenantDashboard({ period: '30d', ...query }, { now: NOW });
  if (!result.ok) throw new Error(`expected data, got ${result.status}`);
  return result.data;
}

describe('getTenantDashboard scope (D-026, from the session only)', () => {
  it('tenant admin sees the whole tenant', async () => {
    const data = await dashboardAs('tenant_admin');
    expect(data.scope).toEqual({ kind: 'tenant' });
    expect(data.kpis.learners.value).toBe(214 + 168 + 96);
  });

  it('branch admin of A1 sees only Branch A1 figures, deadlines and activity', async () => {
    const all = await dashboardAs('tenant_admin');
    const a1 = await dashboardAs('branch_admin');
    expect(a1.scope).toEqual({
      kind: 'branches',
      branches: [{ id: 'demo-tenant-1-branch-a1', name: 'Example Branch A1' }],
    });
    expect(a1.kpis.learners.value).toBe(214);
    expect(a1.kpis.overdueEnrollments).toBeLessThan(all.kpis.overdueEnrollments);
    expect(a1.kpis.completionRate.enrolled).toBeLessThan(all.kpis.completionRate.enrolled);
    // A2-only events never reach an A1 admin; organisation-wide course publishing does.
    expect(a1.activity.map((e) => e.subject)).not.toContain('Example Branch A2');
    expect(a1.activity.some((e) => e.action === 'course.published')).toBe(true);
    expect(a1.upcomingDeadlines.reduce((s, d) => s + d.learnersOutstanding, 0)).toBe(8 + 5 + 6);
  });

  it('branch admin cannot widen scope through tenantId or branchId in the query', async () => {
    const plain = await dashboardAs('branch_admin');
    const tampered = await dashboardAs('branch_admin', 'demo-tenant-1', {
      tenantId: 'demo-tenant-2',
      branchId: 'demo-tenant-1-branch-a2',
      scope: 'tenant',
    });
    expect(tampered).toEqual(plain);
  });

  it('switching tenant (session) changes the numbers', async () => {
    const one = await dashboardAs('tenant_admin', 'demo-tenant-1');
    const two = await dashboardAs('tenant_admin', 'demo-tenant-2');
    expect(two.kpis.learners.value).toBeLessThan(one.kpis.learners.value);
  });

  it('roles without report.read and sessions without a tenant are refused (403)', async () => {
    for (const role of ['learner', 'platform_super_admin'] as const) {
      current = buildDemoSession(role, 'demo-tenant-1');
      expect(await getTenantDashboard({}, { now: NOW })).toMatchObject({ ok: false, status: 403 });
    }
  });
});

describe('getTenantDashboard figures', () => {
  it('keeps the completion KPI equal to the learning-progress series (D-065)', async () => {
    const data = await dashboardAs('learning_manager');
    const enrolled = data.learningProgress.reduce((s, p) => s + p.enrollments, 0);
    const completed = data.learningProgress.reduce((s, p) => s + p.completions, 0);
    expect(data.kpis.completionRate).toEqual({
      enrolled,
      completed,
      rate: Math.floor((completed * 10_000) / enrolled),
    });
  });

  it('merges deadlines shared by branches and lists at most five, soonest first', async () => {
    const data = await dashboardAs('tenant_admin');
    expect(data.upcomingDeadlines).toHaveLength(5);
    const dates = data.upcomingDeadlines.map((d) => d.dueOn);
    expect([...dates].sort()).toEqual(dates);
    // Fire Safety is due in 3 days in both A1 (8) and A2 (6).
    expect(data.upcomingDeadlines[0]).toMatchObject({
      courseTitle: 'Fire Safety Refresher (Demo)',
      dueOn: '2026-10-23',
      learnersOutstanding: 14,
    });
  });

  it('empty and error states', async () => {
    current = buildDemoSession('tenant_admin', 'demo-tenant-1');
    const empty = await getTenantDashboard({}, { now: NOW, demoState: 'empty' });
    if (!empty.ok) throw new Error('expected data');
    expect(empty.data.kpis.completionRate.rate).toBeNull();
    expect(empty.data.upcomingDeadlines).toEqual([]);
    expect(await getTenantDashboard({}, { now: NOW, demoState: 'error' })).toMatchObject({
      ok: false,
      status: 500,
    });
    expect(await getTenantDashboard({ period: 'all' }, { now: NOW })).toMatchObject({
      status: 422,
    });
  });
});
