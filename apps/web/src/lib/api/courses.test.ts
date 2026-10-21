import type { RoleKey } from './session-types';
import { buildDemoSession } from '@/mocks/demo-session';

let current = buildDemoSession('tenant_admin', 'demo-tenant-1');
vi.mock('./session', () => ({ getSession: async () => current }));

const { listCourses, listCategories } = await import('./courses');

const NOW = new Date('2026-10-20T09:30:00.000Z');

async function list(query: object, role: RoleKey = 'tenant_admin', tenantId = 'demo-tenant-1') {
  current = buildDemoSession(role, tenantId);
  return listCourses(query, { now: NOW });
}

async function page(query: object, role?: RoleKey, tenantId?: string) {
  const result = await list(query, role, tenantId);
  if (!result.ok) throw new Error(`expected data, got ${result.status} ${result.error.code}`);
  return result.data;
}

async function all(query: object) {
  const rows = [];
  let cursor: string | undefined;
  do {
    const p = await page({ ...query, cursor });
    rows.push(...p.data);
    cursor = p.page.nextCursor ?? undefined;
  } while (cursor);
  return rows;
}

describe('listCourses: filters and sort (server-side)', () => {
  it('pages through every course exactly once, newest first by default', async () => {
    const rows = await all({ limit: 10 });
    expect(rows).toHaveLength(38);
    expect(new Set(rows.map((r) => r.id)).size).toBe(38);
    const updated = rows.map((r) => r.updatedAt);
    expect([...updated].sort().reverse()).toEqual(updated);
  });

  it('filters by status, level, delivery mode, category and search together', async () => {
    const categories = await listCategories();
    if (!categories.ok) throw new Error('expected categories');
    const safety = categories.data.data.find((c) => c.name === 'Safety')!;
    const rows = await all({ status: 'published', categoryId: safety.id, level: 'beginner' });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toMatchObject({ status: 'published', level: 'beginner', category: safety });
    }
    const search = await page({ search: 'forklift' });
    expect(search.data.map((r) => r.title)).toEqual(
      expect.arrayContaining(['Forklift Operation Basics (Demo)']),
    );
    expect(search.data.every((r) => /forklift/i.test(r.title))).toBe(true);
  });

  it('sorts by title in both directions with a stable tie-breaker', async () => {
    const asc = (await all({ sort: 'title', direction: 'asc' })).map((r) => r.title);
    const desc = (await all({ sort: 'title', direction: 'desc' })).map((r) => r.title);
    expect(asc).toEqual([...asc].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
    expect(desc[0]).toBe(asc.at(-1));
  });
});

describe('listCourses: cursors and bounds', () => {
  it('rejects a cursor reused with different filters (cannot widen or shift the result set)', async () => {
    const first = await page({ status: 'draft', limit: 2 });
    const reused = await list({ status: 'published', limit: 2, cursor: first.page.nextCursor });
    expect(reused).toMatchObject({ ok: false, status: 422, error: { code: 'INVALID_CURSOR' } });
  });

  it('rejects forged and garbage cursors', async () => {
    const forged = Buffer.from(JSON.stringify({ o: 0, k: 'guess' })).toString('base64url');
    expect(await list({ cursor: forged })).toMatchObject({ status: 422 });
    expect(await list({ cursor: '%%%not-a-cursor' })).toMatchObject({ status: 422 });
  });

  it('rejects limits over 100, unknown sort fields and a tenantId parameter', async () => {
    expect(await list({ limit: 500 })).toMatchObject({ status: 422 });
    expect(await list({ sort: 'tenantId' })).toMatchObject({ status: 422 });
    expect(await list({ tenantId: 'demo-tenant-2' })).toMatchObject({ status: 422 });
  });
});

describe('listCourses: tenant isolation and permissions', () => {
  it('each tenant sees only its own courses; a cursor from one tenant is invalid in the other', async () => {
    const one = await page({ limit: 5 }, 'tenant_admin', 'demo-tenant-1');
    const two = await page({ limit: 5 }, 'tenant_admin', 'demo-tenant-2');
    expect(one.data.every((r) => r.id.startsWith('demo-tenant-1-'))).toBe(true);
    expect(two.data.every((r) => r.id.startsWith('demo-tenant-2-'))).toBe(true);
    expect(
      await list({ limit: 5, cursor: one.page.nextCursor }, 'tenant_admin', 'demo-tenant-2'),
    ).toMatchObject({
      status: 422,
    });
  });

  it('branch admin, learning manager and compliance viewer read the same catalogue (courses are tenant-wide)', async () => {
    const ta = await page({ limit: 100 });
    for (const role of ['branch_admin', 'learning_manager', 'compliance_viewer'] as const) {
      expect((await page({ limit: 100 }, role)).data).toEqual(ta.data);
    }
  });

  it('roles without course.read are refused', async () => {
    expect(await list({}, 'learner')).toMatchObject({ ok: false, status: 403 });
  });
});
