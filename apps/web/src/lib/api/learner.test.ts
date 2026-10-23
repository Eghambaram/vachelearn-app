import type { RoleKey } from './session-types';
import { buildDemoSession } from '@/mocks/demo-session';
import { demoEnrollments } from '@/mocks/enrollments';

let current = buildDemoSession('learner', 'demo-tenant-1');
vi.mock('./session', () => ({ getSession: async () => current }));

const { getCoursePlayer, getLearnerDashboard, getLessonView } = await import('./learner');

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

const MINE = 'demo-tenant-1-demo-user-enr-01'; // Fire Safety Refresher, in progress, 60%

async function player(enrollmentId = MINE) {
  current = buildDemoSession('learner', 'demo-tenant-1');
  const result = await getCoursePlayer(enrollmentId, { now: NOW });
  if (!result.ok) throw new Error(`expected data, got ${result.status}`);
  return result.data;
}

describe('getCoursePlayer: own enrollment only', () => {
  it("404s for someone else's, a cancelled, another tenant's or an unknown enrollment", async () => {
    current = buildDemoSession('learner', 'demo-tenant-1');
    for (const id of [
      'demo-tenant-1-demo-other-learner-enr-01',
      'demo-tenant-1-demo-user-enr-10',
      'demo-tenant-2-demo-user-enr-01',
      'nope',
    ]) {
      expect(await getCoursePlayer(id, { now: NOW })).toMatchObject({ ok: false, status: 404 });
    }
  });

  it('a session without a tenant is refused, and demo states map to 403 / 500', async () => {
    current = buildDemoSession('platform_super_admin', null);
    expect(await getCoursePlayer(MINE, { now: NOW })).toMatchObject({ status: 403 });
    current = buildDemoSession('learner', 'demo-tenant-1');
    expect(await getCoursePlayer(MINE, { now: NOW, demoState: 'error' })).toMatchObject({
      status: 500,
    });
    // A 404 stays a 404 whatever the demo state, so a hidden enrollment never shows as anything else.
    for (const demoState of ['error', 'forbidden'] as const) {
      expect(
        await getCoursePlayer('demo-tenant-1-demo-other-learner-enr-01', { now: NOW, demoState }),
      ).toMatchObject({ status: 404 });
    }
  });
});

describe('getCoursePlayer: figures agree with the dashboard', () => {
  it('progress, status and the resume lesson match what the dashboard shows', async () => {
    const data = await player();
    const card = (await dashboard()).continueLearning.find((c) => c.enrollmentId === MINE)!;
    expect(data.enrollment).toMatchObject({
      courseTitle: 'Fire Safety Refresher (Demo)',
      status: card.status,
      progressPercent: card.progressPercent,
      requiredLessons: 20,
      requiredCompleted: 12,
    });
    expect(card.progressPercent).toBe(60);
    const lessons = data.modules.flatMap((m) => m.lessons);
    const resume = lessons.find((l) => l.id === data.resumeLessonId)!;
    expect(resume).toMatchObject({ progress: 'in_progress', title: card.nextLessonTitle });
  });

  it('an overdue enrollment is shown as overdue (D-054)', async () => {
    const data = await player('demo-tenant-1-demo-user-enr-02');
    expect(data.enrollment.status).toBe('overdue');
  });

  it('a not-started course resumes at its first lesson; a completed one opens for review', async () => {
    const notStarted = await player('demo-tenant-1-demo-user-enr-04');
    expect(notStarted.resumeLessonId).toBe(notStarted.modules[0]!.lessons[0]!.id);
    expect(notStarted.enrollment.progressPercent).toBe(0);
    const completed = await player('demo-tenant-1-demo-user-enr-07');
    expect(completed.enrollment.progressPercent).toBe(100);
    expect(
      completed.modules.flatMap((m) => m.lessons).every((l) => l.progress === 'completed'),
    ).toBe(true);
  });

  it('carries each lesson’s completion rule (D-041)', async () => {
    const lessons = (await player()).modules.flatMap((m) => m.lessons);
    for (const lesson of lessons) {
      expect(lesson.completionRule).toBe(
        {
          text: 'manual',
          link: 'manual',
          video: 'watched_90',
          document: 'acknowledged',
          assessment: 'passed',
        }[lesson.type],
      );
    }
  });
});

describe('getLessonView', () => {
  it('serves a lesson of the enrolled version, and 404s for a lesson of another course', async () => {
    const data = await player();
    const lesson = data.modules[0]!.lessons[0]!;
    expect(await getLessonView(MINE, lesson.id, { now: NOW })).toMatchObject({
      ok: true,
      data: { lessonId: lesson.id },
    });
    const otherCourse = (await player('demo-tenant-1-demo-user-enr-03')).modules[0]!.lessons[0]!;
    expect(await getLessonView(MINE, otherCourse.id, { now: NOW })).toMatchObject({ status: 404 });
  });

  it("404s for a lesson reached through another tenant's or a cancelled enrollment", async () => {
    const mine = demoEnrollments('demo-tenant-1', NOW).filter((e) => e.userId === 'demo-user');
    const cancelled = mine.find((e) => e.status === 'cancelled')!;
    current = buildDemoSession('learner', 'demo-tenant-1');
    expect(
      await getLessonView(cancelled.id, cancelled.modules[0]!.lessons[0]!.id, { now: NOW }),
    ).toMatchObject({ status: 404 });
    const otherTenant = demoEnrollments('demo-tenant-2', NOW).find(
      (e) => e.userId === 'demo-user',
    )!;
    expect(
      await getLessonView(otherTenant.id, otherTenant.modules[0]!.lessons[0]!.id, { now: NOW }),
    ).toMatchObject({ status: 404 });
  });

  it("404s for a lesson reached through someone else's enrollment", async () => {
    const other = demoEnrollments('demo-tenant-1', NOW).find(
      (e) => e.userId === 'demo-other-learner',
    )!;
    const lessonId = other.modules[0]!.lessons[0]!.id;
    current = buildDemoSession('learner', 'demo-tenant-1');
    expect(await getLessonView(other.id, lessonId, { now: NOW })).toMatchObject({ status: 404 });
  });

  it('opening a lesson never completes it; completed lessons carry their completion time', async () => {
    const data = await player();
    const lessons = data.modules.flatMap((m) => m.lessons);
    const open = lessons.find((l) => l.progress !== 'completed')!;
    const view = await getLessonView(MINE, open.id, { now: NOW });
    expect(view).toMatchObject({ ok: true, data: { completedAt: null } });
    expect(
      (await player()).modules.flatMap((m) => m.lessons).find((l) => l.id === open.id),
    ).toMatchObject({ progress: open.progress });
    const doc = lessons.find((l) => l.type === 'document' && l.progress === 'completed')!;
    const docView = await getLessonView(MINE, doc.id, { now: NOW });
    if (!docView.ok || docView.data.content.type !== 'document')
      throw new Error('expected a document');
    expect(docView.data.completedAt).not.toBeNull();
    expect(docView.data.content.acknowledgedAt).toBe(docView.data.completedAt);
  });
});
