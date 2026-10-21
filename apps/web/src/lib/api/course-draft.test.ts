import { publishIssues } from '@vachelearn/contracts';
import type { RoleKey } from './session-types';
import { buildDemoSession } from '@/mocks/demo-session';

let current = buildDemoSession('tenant_admin', 'demo-tenant-1');
vi.mock('./session', () => ({ getSession: async () => current }));

const { getCourseDraft } = await import('./course-draft');
const NOW = new Date('2026-10-20T09:30:00.000Z');

async function as(role: RoleKey, courseId: string, tenantId = 'demo-tenant-1') {
  current = buildDemoSession(role, tenantId);
  return getCourseDraft(courseId, { now: NOW });
}

describe('getCourseDraft', () => {
  it('returns a publishable draft that agrees with the course list', async () => {
    const result = await as('tenant_admin', 'demo-tenant-1-course-001');
    if (!result.ok) throw new Error('expected data');
    const { draft } = result.data;
    expect(draft.basics.title).toBe('Fire Safety Refresher (Demo)');
    expect(draft.modules).toHaveLength(3);
    expect(publishIssues(draft)).toEqual([]);
  });

  it('a new course starts empty, so the checklist lists what is missing', async () => {
    const result = await as('tenant_admin', 'new');
    if (!result.ok) throw new Error('expected data');
    expect(result.data.draft.publishedVersion).toBeNull();
    expect(publishIssues(result.data.draft).map((i) => i.code)).toContain('lesson_required');
  });

  it("another tenant's course id is not found (404), not forbidden", async () => {
    expect(await as('tenant_admin', 'demo-tenant-2-course-001', 'demo-tenant-1')).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await as('tenant_admin', 'nope')).toMatchObject({ status: 404 });
  });

  it('flags archived courses so the builder does not offer edits', async () => {
    const result = await as('tenant_admin', 'demo-tenant-1-course-011');
    if (!result.ok) throw new Error('expected data');
    expect(result.data.archived).toBe(true);
  });

  it('only roles that can edit courses get a draft', async () => {
    for (const role of [
      'branch_admin',
      'learning_manager',
      'compliance_viewer',
      'learner',
    ] as const) {
      expect(await as(role, 'demo-tenant-1-course-001')).toMatchObject({ ok: false, status: 403 });
      expect(await as(role, 'new')).toMatchObject({ ok: false, status: 403 });
    }
  });
});
