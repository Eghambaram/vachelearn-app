import type { INestApplication } from '@nestjs/common';
import {
  CategoryListPage,
  CategoryView,
  CourseAdminListPage,
  CourseAdminView,
  TagView,
} from '@vachelearn/contracts';
import type { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../src/auth/passwords';
import { slugify } from '../src/courses/courses.service';
import { createTestApp } from './app';
import { resetDatabase, testPrisma } from './db';
import { realActors, TEST_PASSWORD } from './sessions';
import { buildTwoTenants, emailOf, type Person, type TwoTenants } from './two-tenants';

/*
 * Categories, tags and course drafts (Slice 3.3; spec §6 AC "a draft is visible only to authorized content managers";
 * phase AC "concurrent edit → 409 with reload path"; D-127–D-130; matrix `catalog.manage`, `course.*`) through real
 * sessions on the shared two-tenant fixture.
 */

let app: INestApplication;
let db: PrismaClient;
let actors: ReturnType<typeof realActors>;
let f: TwoTenants;

beforeAll(async () => {
  ({ app } = await createTestApp());
  db = testPrisma();
  actors = realActors(app, db, await hashPassword(TEST_PASSWORD));
});
beforeEach(async () => {
  await resetDatabase(db);
  f = await buildTwoTenants(db, actors);
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

type Session = Awaited<ReturnType<ReturnType<typeof realActors>['signIn']>>;
const sessions = new Map<string, Session>();
beforeEach(() => sessions.clear());
async function as(person: Person) {
  const cached = sessions.get(person);
  if (cached) return cached;
  const s = await actors.signIn(emailOf(person));
  sessions.set(person, s);
  return s;
}

async function category(person: Person, name: string) {
  const res = await (await as(person)).post('/api/v1/categories', { name });
  expect(res.status).toBe(201);
  return CategoryView.parse(res.body);
}
async function tag(person: Person, name: string) {
  const res = await (await as(person)).post('/api/v1/tags', { name });
  expect(res.status).toBe(201);
  return TagView.parse(res.body);
}
async function course(person: Person, body: Record<string, unknown>) {
  const res = await (await as(person)).post('/api/v1/courses', body);
  expect(res.status).toBe(201);
  return CourseAdminView.parse(res.body);
}
async function save(person: Person, courseId: string, body: Record<string, unknown>) {
  return (await as(person)).patch(`/api/v1/courses/${courseId}/draft`, body);
}
async function list(person: Person, query = '') {
  const res = await (await as(person)).get(`/api/v1/courses${query}`);
  expect(res.status).toBe(200);
  return CourseAdminListPage.parse(res.body);
}
const titles = (page: CourseAdminListPage) => page.data.map((c) => c.title).sort();

describe('categories and tags (D-128)', () => {
  it('a Tenant Admin creates, renames, archives and reactivates them, audited; names unique ignoring case', async () => {
    const safety = await category('adminA', 'Safety');
    expect(
      (await (await as('adminA')).post('/api/v1/categories', { name: 'SAFETY' })).body,
    ).toMatchObject({
      error: { fieldErrors: [{ field: 'name', code: 'taken' }] },
    });
    // Another tenant may use the same name.
    await category('adminB', 'Safety');
    const admin = await as('adminA');
    const renamed = await admin.patch(`/api/v1/categories/${safety.id}`, {
      version: safety.version,
      name: 'Site safety',
    });
    expect(renamed.status).toBe(200);
    const stale = await admin.patch(`/api/v1/categories/${safety.id}`, {
      version: safety.version,
      name: 'Old',
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CONFLICT');
    const archived = await admin.post(`/api/v1/categories/${safety.id}/archive`, {
      reason: 'Merged',
    });
    expect(archived.status).toBe(200);
    expect(archived.body).toMatchObject({ status: 'archived', archivedReason: 'Merged' });
    expect(
      (await admin.post(`/api/v1/categories/${safety.id}/archive`, { reason: 'Again' })).status,
    ).toBe(409);
    expect(
      (await admin.post(`/api/v1/categories/${safety.id}/reactivate`, { reason: 'Back' })).status,
    ).toBe(200);

    const forklift = await tag('adminA', 'Forklift');
    expect((await admin.post('/api/v1/tags', { name: 'forklift' })).status).toBe(422);
    expect(
      (await admin.post(`/api/v1/tags/${forklift.id}/archive`, { reason: 'Unused' })).status,
    ).toBe(200);

    const actions = (await db.auditEvent.findMany({ where: { tenantId: f.tenant.A } })).map(
      (e) => e.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        'category.created',
        'category.renamed',
        'category.archived',
        'category.reactivated',
        'tag.created',
        'tag.archived',
      ]),
    );
  });

  it('course readers list them; only catalog managers change them', async () => {
    await category('adminA', 'Safety');
    for (const reader of ['baA1', 'lmA', 'cvA1'] as const) {
      const res = await (await as(reader)).get('/api/v1/categories');
      expect(res.status).toBe(200);
      expect(CategoryListPage.parse(res.body).data.map((c) => c.name)).toEqual(['Safety']);
      expect((await (await as(reader)).post('/api/v1/categories', { name: 'Mine' })).status).toBe(
        403,
      );
      expect((await (await as(reader)).post('/api/v1/tags', { name: 'Mine' })).status).toBe(403);
    }
    expect((await (await as('learnerA1')).get('/api/v1/categories')).status).toBe(403);
  });

  it('tenant B cannot list, rename or archive tenant A categories and tags (404)', async () => {
    const safety = await category('adminA', 'Safety');
    const forklift = await tag('adminA', 'Forklift');
    const b = await as('adminB');
    expect((await b.get('/api/v1/categories')).body.data).toEqual([]);
    expect((await b.get('/api/v1/tags')).body.data).toEqual([]);
    expect(
      (await b.patch(`/api/v1/categories/${safety.id}`, { version: 1, name: 'Mine' })).status,
    ).toBe(404);
    expect(
      (await b.post(`/api/v1/categories/${safety.id}/archive`, { reason: 'Not yours' })).status,
    ).toBe(404);
    expect(
      (await b.patch(`/api/v1/tags/${forklift.id}`, { version: 1, name: 'Mine' })).status,
    ).toBe(404);
    expect(await db.category.findUniqueOrThrow({ where: { id: safety.id } })).toMatchObject({
      name: 'Safety',
      status: 'active',
    });
  });
});

describe('creating courses and drafts (D-130)', () => {
  it('a Tenant Admin creates a course with its first draft, owned by them, slug from the title, audited', async () => {
    const safety = await category('adminA', 'Safety');
    const created = await course('adminA', {
      title: 'Forklift Safety: Basics',
      categoryId: safety.id,
      level: 'beginner',
      language: 'hi',
    });
    expect(created).toMatchObject({
      slug: 'forklift-safety-basics',
      status: 'draft',
      publishedVersion: null,
      canEdit: true,
      draft: {
        version: 1,
        title: 'Forklift Safety: Basics',
        category: { id: safety.id, name: 'Safety', status: 'active' },
        tags: [],
        level: 'beginner',
        deliveryMode: null,
        language: 'hi',
      },
    });
    expect(created.owner.membershipId).toBe(f.member.adminA);
    const again = await course('adminA', { title: 'Forklift safety basics' });
    expect(again.slug).toBe('forklift-safety-basics-2');
    expect(
      await db.auditEvent.count({ where: { tenantId: f.tenant.A, action: 'course.created' } }),
    ).toBe(2);
    expect(slugify('  Ünïcode — “Quotes” / 2026 ')).toBe('unicode-quotes-2026');
    expect(slugify('!!!')).toBe('');
  });

  it('validates the body: no tenant id or unknown fields, title bounds, listed languages only', async () => {
    const admin = await as('adminA');
    for (const body of [
      { title: 'Good title', tenantId: f.tenant.B },
      { title: 'Good title', status: 'published' },
      { title: 'ab' },
      { title: 'x'.repeat(121) },
      { title: 'Good title', language: 'fr' },
    ]) {
      expect((await admin.post('/api/v1/courses', body)).status).toBe(422);
    }
    expect(await db.course.count()).toBe(0);
  });

  it('only Tenant Admins create courses and edit drafts', async () => {
    const c = await course('adminA', { title: 'Lockout tagout' });
    for (const person of ['baA1', 'lmA', 'lmA1', 'cvA', 'insA1', 'learnerA1'] as const) {
      expect((await (await as(person)).post('/api/v1/courses', { title: 'Mine' })).status).toBe(
        403,
      );
      expect((await save(person, c.id, { version: 1, title: 'Changed' })).status).toBe(403);
    }
    expect(await db.course.count()).toBe(1);
    expect((await db.courseVersion.findFirstOrThrow()).title).toBe('Lockout tagout');
  });

  it('saving names the version read: a stale save is a 409 and changes nothing', async () => {
    const c = await course('adminA', { title: 'Lockout tagout' });
    const first = await save('adminA', c.id, { version: 1, title: 'Lockout tagout v2' });
    expect(first.status).toBe(200);
    expect(CourseAdminView.parse(first.body).draft?.version).toBe(2);
    const second = await save('adminA', c.id, { version: 1, summary: 'Written meanwhile' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');
    const draft = await db.courseVersion.findFirstOrThrow({ where: { courseId: c.id } });
    expect(draft).toMatchObject({ version: 2, title: 'Lockout tagout v2', summary: null });
    // Saving nothing new keeps the version.
    const same = await save('adminA', c.id, { version: 2, title: 'Lockout tagout v2' });
    expect(CourseAdminView.parse(same.body).draft?.version).toBe(2);
  });

  it('saves every basic, keeps the listing title in step, and audits field names without long text', async () => {
    const safety = await category('adminA', 'Safety');
    const [a, b, c2] = [
      await tag('adminA', 'Forklift'),
      await tag('adminA', 'PPE'),
      await tag('adminA', 'Night'),
    ];
    const c = await course('adminA', { title: 'Lockout tagout' });
    const res = await save('adminA', c.id, {
      version: 1,
      title: 'Lockout and tagout',
      summary: 'Isolate energy before maintenance.',
      description: 'Long text',
      categoryId: safety.id,
      tagIds: [a.id, b.id],
      level: 'intermediate',
      deliveryMode: 'blended',
      language: 'mr',
      durationMinutes: 45,
      objectives: ['Apply locks', 'Verify isolation'],
      audience: 'Maintenance staff',
      prerequisites: 'None',
    });
    expect(res.status).toBe(200);
    expect(CourseAdminView.parse(res.body).draft).toMatchObject({
      version: 2,
      category: { id: safety.id },
      tags: [
        { id: a.id, name: 'Forklift' },
        { id: b.id, name: 'PPE' },
      ],
      durationMinutes: 45,
      objectives: ['Apply locks', 'Verify isolation'],
    });
    const replaced = await save('adminA', c.id, { version: 2, tagIds: [c2.id, a.id] });
    expect(CourseAdminView.parse(replaced.body).draft?.tags.map((t) => t.name)).toEqual([
      'Forklift',
      'Night',
    ]);
    expect((await save('adminA', c.id, { version: 3, tagIds: [a.id, a.id] })).status).toBe(422);
    expect(
      (
        await save('adminA', c.id, {
          version: 3,
          tagIds: Array.from({ length: 11 }, () => crypto.randomUUID()),
        })
      ).status,
    ).toBe(422);
    expect((await db.course.findUniqueOrThrow({ where: { id: c.id } })).title).toBe(
      'Lockout and tagout',
    );
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'course.draft_updated', entityId: c.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(audit.after).toMatchObject({
      title: 'Lockout and tagout',
      summary: '[changed]',
      description: '[changed]',
      audience: '[changed]',
      objectives: '[changed]',
      categoryId: safety.id,
    });
    expect(JSON.stringify(audit.after)).not.toContain('Isolate energy');
  });

  it('an archived category or tag cannot be newly chosen, but stays on a draft that already has it', async () => {
    const safety = await category('adminA', 'Safety');
    const old = await category('adminA', 'Old');
    const ppe = await tag('adminA', 'PPE');
    const c = await course('adminA', { title: 'Lockout tagout', categoryId: safety.id });
    expect((await save('adminA', c.id, { version: 1, tagIds: [ppe.id] })).status).toBe(200);
    const admin = await as('adminA');
    await admin.post(`/api/v1/categories/${safety.id}/archive`, { reason: 'Merged' });
    await admin.post(`/api/v1/categories/${old.id}/archive`, { reason: 'Merged' });
    await admin.post(`/api/v1/tags/${ppe.id}/archive`, { reason: 'Merged' });
    const kept = await save('adminA', c.id, {
      version: 2,
      title: 'Lockout tagout 2',
      categoryId: safety.id,
      tagIds: [ppe.id],
    });
    expect(kept.status).toBe(200);
    expect(CourseAdminView.parse(kept.body).draft?.category?.status).toBe('archived');
    const newly = await save('adminA', c.id, { version: 3, categoryId: old.id });
    expect(newly.body.error.fieldErrors).toEqual([
      expect.objectContaining({ field: 'categoryId', code: 'archived' }),
    ]);
    const other = await course('adminA', { title: 'Another' });
    const tagged = await save('adminA', other.id, { version: 1, tagIds: [ppe.id] });
    expect(tagged.body.error.fieldErrors).toEqual([
      expect.objectContaining({ field: 'tagIds', code: 'archived' }),
    ]);
    expect(
      (await (await as('adminA')).post('/api/v1/courses', { title: 'Third', categoryId: old.id }))
        .status,
    ).toBe(422);
  });
});

describe('who sees courses and drafts (D-127)', () => {
  it('Branch Admins, Learning Managers and Compliance Viewers read every course, drafts included, read-only', async () => {
    const c = await course('adminA', { title: 'Lockout tagout' });
    for (const reader of ['baA1', 'lmA', 'lmA1', 'cvA', 'cvA1'] as const) {
      expect(titles(await list(reader))).toEqual(['Lockout tagout']);
      const one = await (await as(reader)).get(`/api/v1/courses/${c.id}`);
      expect(one.status).toBe(200);
      expect(CourseAdminView.parse(one.body)).toMatchObject({ status: 'draft', canEdit: false });
    }
  });

  it('an Instructor sees no courses before class sessions exist; learners and the anonymous are refused', async () => {
    const c = await course('adminA', { title: 'Lockout tagout' });
    expect((await list('insA1')).data).toEqual([]);
    expect((await (await as('insA1')).get(`/api/v1/courses/${c.id}`)).status).toBe(404);
    expect((await (await as('learnerA1')).get('/api/v1/courses')).status).toBe(403);
    expect((await (await as('learnerA1')).get(`/api/v1/courses/${c.id}`)).status).toBe(403);
    const anonymous = await (
      await import('supertest')
    )
      .default(app.getHttpServer())
      .get('/api/v1/courses');
    expect(anonymous.status).toBe(401);
  });

  it('a support session reads courses and course labels in the audit log, and cannot change anything', async () => {
    const c = await course('adminA', { title: 'Lockout tagout' });
    const staff = await actors.signIn(emailOf('staff'));
    const started = await staff.post('/api/v1/platform/support-sessions', {
      tenantId: f.tenant.A,
      reason: 'Ticket 14: checking courses',
    });
    expect(started.status).toBe(201);
    expect(
      (await staff.get('/api/v1/courses')).body.data.map((r: { title: string }) => r.title),
    ).toEqual(['Lockout tagout']);
    expect((await staff.post('/api/v1/courses', { title: 'Staff course' })).status).toBe(403);
    expect(
      (await staff.patch(`/api/v1/courses/${c.id}/draft`, { version: 1, title: 'Staff' })).status,
    ).toBe(403);
    const log = await staff.get('/api/v1/audit-events?limit=100');
    const created = (log.body.data as { action: string; entityLabel: string | null }[]).find(
      (e) => e.action === 'course.created',
    );
    expect(created?.entityLabel).toBe('Lockout tagout');
  });
});

describe('tenant isolation', () => {
  it('tenant B cannot read, list or edit tenant A courses (404, never 403)', async () => {
    const c = await course('adminA', { title: 'Lockout tagout' });
    await course('adminB', { title: 'B course' });
    expect(titles(await list('adminB'))).toEqual(['B course']);
    expect(titles(await list('baB1'))).toEqual(['B course']);
    expect((await (await as('adminB')).get(`/api/v1/courses/${c.id}`)).status).toBe(404);
    expect((await save('adminB', c.id, { version: 1, title: 'Taken over' })).status).toBe(404);
    expect((await db.courseVersion.findFirstOrThrow({ where: { courseId: c.id } })).title).toBe(
      'Lockout tagout',
    );
  });

  it('a tenant B category or tag cannot be put on a tenant A course; nothing changes', async () => {
    const bCategory = await category('adminB', 'B safety');
    const bTag = await tag('adminB', 'B tag');
    const c = await course('adminA', { title: 'Lockout tagout' });
    const withCategory = await save('adminA', c.id, { version: 1, categoryId: bCategory.id });
    expect(withCategory.status).toBe(422);
    expect(withCategory.body.error.fieldErrors[0]).toMatchObject({
      field: 'categoryId',
      code: 'not_found',
    });
    const withTag = await save('adminA', c.id, { version: 1, tagIds: [bTag.id] });
    expect(withTag.body.error.fieldErrors[0]).toMatchObject({ field: 'tagIds', code: 'not_found' });
    expect(
      (
        await (
          await as('adminA')
        ).post('/api/v1/courses', { title: 'X course', categoryId: bCategory.id })
      ).status,
    ).toBe(422);
    expect(await db.courseVersionTag.count()).toBe(0);
    expect(
      (await db.courseVersion.findFirstOrThrow({ where: { courseId: c.id } })).categoryId,
    ).toBeNull();
    // Filtering by another tenant's category finds nothing, never widens.
    expect((await list('adminA', `?categoryId=${bCategory.id}`)).data).toEqual([]);
  });

  it('a list cursor from tenant A is refused in tenant B and for another query', async () => {
    for (const title of ['Alpha course', 'Bravo course', 'Charlie course'])
      await course('adminA', { title });
    const first = await list('adminA', '?sort=title&direction=asc&limit=2');
    expect(titles(first)).toEqual(['Alpha course', 'Bravo course']);
    const cursor = first.page.nextCursor!;
    const next = await list(
      'adminA',
      `?sort=title&direction=asc&limit=2&cursor=${encodeURIComponent(cursor)}`,
    );
    expect(titles(next)).toEqual(['Charlie course']);
    expect(
      (
        await (
          await as('adminB')
        ).get(
          `/api/v1/courses?sort=title&direction=asc&limit=2&cursor=${encodeURIComponent(cursor)}`,
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await (
          await as('adminA')
        ).get(
          `/api/v1/courses?sort=title&direction=asc&limit=2&search=a&cursor=${encodeURIComponent(cursor)}`,
        )
      ).status,
    ).toBe(422);
    expect((await (await as('adminA')).get('/api/v1/courses?sort=slug')).status).toBe(422);
    expect((await (await as('adminA')).get('/api/v1/courses?limit=101')).status).toBe(422);
  });

  it('filters narrow the list: search, status, category, level, language', async () => {
    const safety = await category('adminA', 'Safety');
    const a = await course('adminA', {
      title: 'Forklift basics',
      categoryId: safety.id,
      level: 'beginner',
    });
    await course('adminA', { title: 'Crane signals', language: 'hi', level: 'advanced' });
    expect(titles(await list('adminA', '?search=FORK'))).toEqual(['Forklift basics']);
    expect(titles(await list('adminA', `?categoryId=${safety.id}`))).toEqual(['Forklift basics']);
    expect(titles(await list('adminA', '?level=advanced'))).toEqual(['Crane signals']);
    expect(titles(await list('adminA', '?language=hi'))).toEqual(['Crane signals']);
    expect((await list('adminA', '?status=published')).data).toEqual([]);
    expect((await list('adminA', '?status=draft')).data).toHaveLength(2);
    const row = (await list('adminA', '?search=fork')).data[0]!;
    expect(row).toMatchObject({
      id: a.id,
      category: { name: 'Safety' },
      status: 'draft',
      hasUnpublishedChanges: false,
    });
  });
});

describe('database rules', () => {
  it('a published version and its tags never change and are never deleted', async () => {
    const ppe = await tag('adminA', 'PPE');
    const c = await course('adminA', { title: 'Lockout tagout' });
    await save('adminA', c.id, { version: 1, tagIds: [ppe.id] });
    const draft = await db.courseVersion.findFirstOrThrow({ where: { courseId: c.id } });
    // Publishing is 3.6; here the row is moved to published directly to prove the guard.
    await db.courseVersion.update({
      where: { id: draft.id },
      data: {
        status: 'published',
        versionNumber: 1,
        publishedAt: new Date(),
        publishedById: f.user.adminA,
      },
    });
    await expect(
      db.courseVersion.update({ where: { id: draft.id }, data: { title: 'Changed' } }),
    ).rejects.toThrow(/published course version cannot change/);
    await expect(db.courseVersion.delete({ where: { id: draft.id } })).rejects.toThrow();
    await expect(
      db.courseVersionTag.deleteMany({ where: { courseVersionId: draft.id } }),
    ).rejects.toThrow(/tags cannot change/);
    const other = await tag('adminA', 'Other');
    await expect(
      db.courseVersionTag.create({
        data: { tenantId: f.tenant.A, courseVersionId: draft.id, tagId: other.id },
      }),
    ).rejects.toThrow();
    // The API refuses to edit a course without a draft.
    const res = await save('adminA', c.id, { version: 1, title: 'Changed' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_DRAFT');
  });

  it('one draft per course; slug and tenant fixed; categories never deleted; cross-tenant links refused', async () => {
    const c = await course('adminA', { title: 'Lockout tagout' });
    await expect(
      db.courseVersion.create({
        data: { tenantId: f.tenant.A, courseId: c.id, title: 'Second draft' },
      }),
    ).rejects.toThrow();
    await expect(
      db.course.update({ where: { id: c.id }, data: { slug: 'other' } }),
    ).rejects.toThrow(/slug never change/);
    const safety = await category('adminA', 'Safety');
    await expect(db.category.delete({ where: { id: safety.id } })).rejects.toThrow(/never deleted/);
    const bCategory = await category('adminB', 'B safety');
    const draft = await db.courseVersion.findFirstOrThrow({ where: { courseId: c.id } });
    await expect(
      db.courseVersion.update({ where: { id: draft.id }, data: { categoryId: bCategory.id } }),
    ).rejects.toThrow();
    await expect(
      db.courseVersion.update({ where: { id: draft.id }, data: { language: 'xx' } }),
    ).rejects.toThrow();
  });
});

describe('review fixes (isolation audit and security review 3.3)', () => {
  it('an Instructor lists no categories or tags; only catalog managers see archive reasons', async () => {
    const safety = await category('adminA', 'Safety');
    await tag('adminA', 'PPE');
    await (
      await as('adminA')
    ).post(`/api/v1/categories/${safety.id}/archive`, {
      reason: 'Contractor dispute',
    });
    for (const path of ['/api/v1/categories', '/api/v1/tags']) {
      const res = await (await as('insA1')).get(path);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    }
    const asAdmin = CategoryListPage.parse(
      (await (await as('adminA')).get('/api/v1/categories')).body,
    );
    expect(asAdmin.data[0]?.archivedReason).toBe('Contractor dispute');
    for (const reader of ['baA1', 'lmA', 'cvA'] as const) {
      const page = CategoryListPage.parse(
        (await (await as(reader)).get('/api/v1/categories')).body,
      );
      expect(page.data[0]).toMatchObject({ status: 'archived', archivedReason: null });
    }
  });

  it('a support session cannot add, rename or archive categories and tags', async () => {
    const safety = await category('adminA', 'Safety');
    const ppe = await tag('adminA', 'PPE');
    const staff = await actors.signIn(emailOf('staff'));
    expect(
      (
        await staff.post('/api/v1/platform/support-sessions', {
          tenantId: f.tenant.A,
          reason: 'Ticket 15: catalog',
        })
      ).status,
    ).toBe(201);
    expect((await staff.get('/api/v1/categories')).status).toBe(200);
    expect((await staff.post('/api/v1/categories', { name: 'Staff' })).status).toBe(403);
    expect(
      (await staff.patch(`/api/v1/categories/${safety.id}`, { version: 1, name: 'Staff' })).status,
    ).toBe(403);
    expect(
      (await staff.post(`/api/v1/tags/${ppe.id}/archive`, { reason: 'Staff change' })).status,
    ).toBe(403);
    expect(await db.category.count({ where: { tenantId: f.tenant.A } })).toBe(1);
    expect((await db.tag.findUniqueOrThrow({ where: { id: ppe.id } })).status).toBe('active');
  });

  it('a Tenant Admin whose role was revoked after signing in cannot change courses or the catalog (live reach)', async () => {
    const c = await course('adminA', { title: 'Lockout tagout' });
    const safety = await category('adminA', 'Safety');
    const admin = await as('adminA');
    await db.roleAssignment.updateMany({
      where: { membershipId: f.member.adminA, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: f.user.adminA, revokedReason: 'Moved on' },
    });
    for (const res of [
      await admin.post('/api/v1/courses', { title: 'After revocation' }),
      await admin.patch(`/api/v1/courses/${c.id}/draft`, { version: 1, title: 'After revocation' }),
      await admin.post('/api/v1/categories', { name: 'After' }),
      await admin.patch(`/api/v1/categories/${safety.id}`, { version: 1, name: 'After' }),
      await admin.post(`/api/v1/categories/${safety.id}/archive`, { reason: 'After revocation' }),
    ]) {
      expect([403, 404]).toContain(res.status);
    }
    expect(await db.course.count()).toBe(1);
    expect((await db.courseVersion.findFirstOrThrow()).title).toBe('Lockout tagout');
    expect(await db.category.findUniqueOrThrow({ where: { id: safety.id } })).toMatchObject({
      name: 'Safety',
      status: 'active',
    });
  });

  it('tenant B cannot archive or reactivate tenant A tags and categories; catalog cursors stay in their tenant', async () => {
    const safety = await category('adminA', 'Safety');
    const ppe = await tag('adminA', 'PPE');
    await (
      await as('adminA')
    ).post(`/api/v1/categories/${safety.id}/archive`, { reason: 'Merged here' });
    const b = await as('adminB');
    expect((await b.post(`/api/v1/tags/${ppe.id}/archive`, { reason: 'Not yours' })).status).toBe(
      404,
    );
    expect(
      (await b.post(`/api/v1/tags/${ppe.id}/reactivate`, { reason: 'Not yours' })).status,
    ).toBe(404);
    expect(
      (await b.post(`/api/v1/categories/${safety.id}/reactivate`, { reason: 'Not yours' })).status,
    ).toBe(404);
    expect((await db.category.findUniqueOrThrow({ where: { id: safety.id } })).status).toBe(
      'archived',
    );
    await tag('adminA', 'Forklift');
    const first = await (await as('adminA')).get('/api/v1/tags?limit=1');
    const cursor = encodeURIComponent(first.body.page.nextCursor);
    expect((await (await as('adminA')).get(`/api/v1/tags?limit=1&cursor=${cursor}`)).status).toBe(
      200,
    );
    expect((await b.get(`/api/v1/tags?limit=1&cursor=${cursor}`)).status).toBe(422);
    expect(
      (await (await as('adminA')).get(`/api/v1/tags?limit=1&status=active&cursor=${cursor}`))
        .status,
    ).toBe(422);
    expect(
      (await (await as('adminA')).get(`/api/v1/categories?limit=1&cursor=${cursor}`)).status,
    ).toBe(422);
  });

  it('an updatedAt-sorted course cursor is refused in another tenant and for a branch admin', async () => {
    for (const title of ['Alpha course', 'Bravo course']) await course('adminA', { title });
    const first = await list('adminA', '?limit=1');
    const cursor = encodeURIComponent(first.page.nextCursor!);
    expect(
      (await (await as('adminA')).get(`/api/v1/courses?limit=1&cursor=${cursor}`)).status,
    ).toBe(200);
    expect(
      (await (await as('adminB')).get(`/api/v1/courses?limit=1&cursor=${cursor}`)).status,
    ).toBe(422);
  });

  it('slugs: a title without Latin letters gets a random suffix; names with invisible characters are refused', async () => {
    const hindi = await course('adminA', { title: 'सुरक्षा प्रशिक्षण', language: 'hi' });
    expect(hindi.slug).toMatch(/^course-[a-z2-7]{6}$/);
    const other = await course('adminA', { title: 'सुरक्षा प्रशिक्षण २', language: 'hi' });
    expect(other.slug).not.toBe(hindi.slug);
    // A conjunct with a zero-width joiner is fine in a title (Indic scripts, D-129).
    expect(
      (await (await as('adminA')).post('/api/v1/courses', { title: 'क्‍ष training' })).status,
    ).toBe(201);
    const admin = await as('adminA');
    for (const name of ['Saf​ety', 'Safety‮', 'Tab\tname']) {
      expect((await admin.post('/api/v1/categories', { name })).status).toBe(422);
      expect((await admin.post('/api/v1/tags', { name })).status).toBe(422);
    }
    expect((await admin.post('/api/v1/courses', { title: 'Reversed‮ title' })).status).toBe(422);
    // NFC: the decomposed and composed forms are the same name.
    await category('adminA', 'Café');
    expect((await admin.post('/api/v1/categories', { name: 'Café' })).status).toBe(422);
    // The title's slug, then -2 … -5 (one bounded lookup), then a random suffix.
    expect((await course('adminA', { title: 'Same title' })).slug).toBe('same-title');
    for (const n of [2, 3, 4, 5]) {
      expect((await course('adminA', { title: 'Same title' })).slug).toBe(`same-title-${n}`);
    }
    expect((await course('adminA', { title: 'Same title' })).slug).toMatch(
      /^same-title-[a-z2-7]{6}$/,
    );
  });

  it('a course with a published version and a draft: the row and its filters follow the draft', async () => {
    const c = await course('adminA', { title: 'Lockout tagout', level: 'beginner' });
    const v1 = await db.courseVersion.findFirstOrThrow({ where: { courseId: c.id } });
    await db.courseVersion.update({
      where: { id: v1.id },
      data: {
        status: 'published',
        versionNumber: 1,
        publishedAt: new Date(),
        publishedById: f.user.adminA,
      },
    });
    await db.courseVersion.create({
      data: { tenantId: f.tenant.A, courseId: c.id, title: 'Lockout tagout v2', level: 'advanced' },
    });
    const row = (await list('adminA', '?status=published')).data[0]!;
    expect(row).toMatchObject({
      id: c.id,
      level: 'advanced',
      status: 'published',
      publishedVersion: 1,
      hasUnpublishedChanges: true,
    });
    expect((await list('adminA', '?level=advanced')).data.map((r) => r.id)).toEqual([c.id]);
    expect((await list('adminA', '?level=beginner')).data).toEqual([]);
    await expect(
      db.courseVersion.create({
        data: {
          tenantId: f.tenant.A,
          courseId: c.id,
          title: 'Inserted published',
          status: 'published',
          versionNumber: 9,
          publishedAt: new Date(),
          publishedById: f.user.adminA,
        },
      }),
    ).rejects.toThrow(/created as a draft/);
  });
});
