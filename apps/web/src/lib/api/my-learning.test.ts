import type { SessionView } from './session-types';
import { buildDemoSession } from '@/mocks/demo-session';

// My learning (UI spec #40, sample data): the session decides whose enrolments; other learners' never appear.
let current: SessionView = buildDemoSession('learner', 'demo-tenant-1');
vi.mock('./session', () => ({ getSession: async () => current }));

const { getMyLearning } = await import('./learner');

const NOW = new Date('2026-11-11T06:30:00.000Z');

describe('getMyLearning', () => {
  it('lists the learner’s own live enrolments, most urgent first, without cancelled ones', async () => {
    const result = await getMyLearning(NOW);
    if (!result.ok) throw new Error('expected data');
    const { items } = result.data;
    expect(items.length).toBeGreaterThan(5);
    expect(items.some((i) => i.courseTitle === 'Confined Space Entry (Demo)')).toBe(false);
    // Another learner's enrolments never appear.
    expect(items.some((i) => i.courseTitle === 'Electrical Safety (Demo)')).toBe(false);
    const order = ['overdue', 'in_progress', 'not_started', 'completed'];
    const ranks = items.map((i) => order.indexOf(i.status));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    for (const item of items.filter((i) => i.status === 'completed')) {
      expect(item.completedAt).not.toBeNull();
      expect(item.progressPercent).toBe(100);
    }
  });

  it('is refused without enrollment.read', async () => {
    current = { ...buildDemoSession('learner', 'demo-tenant-1'), permissions: [] };
    const result = await getMyLearning(NOW);
    expect(result.ok ? 200 : result.status).toBe(403);
  });
});
