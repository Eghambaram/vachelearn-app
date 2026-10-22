import type { RoleKey } from './session-types';
import { buildDemoSession } from '@/mocks/demo-session';
import { demoEnrollments } from '@/mocks/enrollments';

let current = buildDemoSession('learner', 'demo-tenant-1');
vi.mock('./session', () => ({ getSession: async () => current }));

const { getLearnerDashboard, getMyEnrollment } = await import('./learner');

// Fixed clock: 22 Oct 2026, 15:00 IST.
const NOW = new Date('2026-10-22T09:30:00.000Z');

async function dashboard(role: RoleKey = 'learner', tenantId = 'demo-tenant-1') {
  current = buildDemoSession(role, tenantId);
  const result = await getLearnerDashboard({ now: NOW });
  if (!result.ok) throw new Error(`expected data, got ${result.status}`);
  return result.data;
}

describe('getLearnerDashboard: own records only', () => {
  it("never includes another learner's enrollments from the same tenant", async () => {
    const data = await dashboard();
    const others = demoEnrollments('demo-tenant-1', NOW)
      .filter((e) => e.userId !== 'demo-user')
      .map((e) => e.id);
    const shown = [...data.continueLearning, ...data.deadlines, ...data.recentlyCompleted].map(
      (e) => e.enrollmentId,
    );
    expect(others.length).toBeGreaterThan(0);
    expect(shown.filter((id) => others.includes(id))).toEqual([]);
    expect(shown.every((id) => id.startsWith('demo-tenant-1-demo-user-'))).toBe(true);
  });

  it('switching tenant shows that tenant’s enrollments only', async () => {
    const data = await dashboard('learner', 'demo-tenant-2');
    expect(data.continueLearning.every((e) => e.enrollmentId.startsWith('demo-tenant-2-'))).toBe(
      true,
    );
  });

  it('a session without a tenant, or without enrollment.read, is refused', async () => {
    current = buildDemoSession('platform_super_admin', null);
    expect(await getLearnerDashboard({ now: NOW })).toMatchObject({ ok: false, status: 403 });
  });
});

describe('getLearnerDashboard: figures', () => {
  it('summarises by display status with overdue derived (D-054) and cancelled excluded', async () => {
    const data = await dashboard();
    expect(data.summary).toEqual({ notStarted: 2, inProgress: 2, overdue: 2, completed: 3 });
  });

  it('continue learning lists started courses, most recently active first, overdue ones flagged', async () => {
    const data = await dashboard();
    expect(data.continueLearning.map((e) => [e.courseTitle, e.status])).toEqual([
      ['Fire Safety Refresher (Demo)', 'in_progress'],
      ['Hazard Identification (Demo)', 'in_progress'],
      ['Forklift Operation Basics (Demo)', 'overdue'],
    ]);
  });

  it('deadlines: overdue and due within 30 days, soonest first, completed and cancelled excluded', async () => {
    const data = await dashboard();
    expect(data.deadlines.map((d) => [d.courseTitle, d.dueOn, d.status])).toEqual([
      ['Machine Guarding (Demo)', '2026-10-16', 'overdue'],
      ['Forklift Operation Basics (Demo)', '2026-10-20', 'overdue'],
      ['Fire Safety Refresher (Demo)', '2026-10-25', 'in_progress'],
      ['PPE and Equipment (Demo)', '2026-10-31', 'not_started'],
      ['Hazard Identification (Demo)', '2026-11-03', 'in_progress'],
    ]);
  });

  it('keeps completion and certificate separate', async () => {
    const data = await dashboard();
    expect(data.recentlyCompleted.map((c) => [c.courseTitle, c.certificate !== null])).toEqual([
      ['First Aid Essentials (Demo)', true],
      ['Working at Height (Demo)', false],
      ['Chemical Handling (Demo)', true],
    ]);
  });
});

describe('getMyEnrollment', () => {
  it("returns the caller's enrollment and 404s for someone else's or a cancelled one", async () => {
    current = buildDemoSession('learner', 'demo-tenant-1');
    expect(await getMyEnrollment('demo-tenant-1-demo-user-enr-01', { now: NOW })).toMatchObject({
      ok: true,
      data: { courseTitle: 'Fire Safety Refresher (Demo)' },
    });
    expect(
      await getMyEnrollment('demo-tenant-1-demo-other-learner-enr-01', { now: NOW }),
    ).toMatchObject({ ok: false, status: 404 });
    expect(await getMyEnrollment('demo-tenant-1-demo-user-enr-10', { now: NOW })).toMatchObject({
      status: 404,
    });
    expect(await getMyEnrollment('demo-tenant-2-demo-user-enr-01', { now: NOW })).toMatchObject({
      status: 404,
    });
  });
});
