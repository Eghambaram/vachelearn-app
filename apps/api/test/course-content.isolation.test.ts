import type { INestApplication } from '@nestjs/common';
import {
  AssetAccessView,
  AssetView,
  CourseAdminView,
  CourseContentView,
  LessonDetailView,
} from '@vachelearn/contracts';
import type { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../src/auth/passwords';
import { createTestApp } from './app';
import { resetDatabase, testPrisma } from './db';
import { realActors, TEST_PASSWORD } from './sessions';
import { buildTwoTenants, emailOf, type Person, type TwoTenants } from './two-tenants';

/*
 * Course content: modules and lessons of a draft (Slice 3.5; spec §6 AC "reordering persists"; D-041, D-136–D-139)
 * through real sessions and real Postgres: the outline rules, conflicts, who reads and who changes, ids from another
 * tenant / course / version, lesson files (D-138), and the database rules behind them.
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

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n',
);
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from('ftypisom'),
  Buffer.from([0, 0, 2, 0]),
  Buffer.from('isomiso2'),
  Buffer.from([0, 0, 0, 8]),
  Buffer.from('free'),
]);

async function upload(person: Person, kind: 'video' | 'document', content: Buffer, name: string) {
  const res = await (await as(person)).upload(`/api/v1/assets?kind=${kind}`, content, name);
  expect(res.status).toBe(201);
  return AssetView.parse(res.body);
}

async function course(person: Person = 'adminA', title = 'Lockout tagout') {
  const res = await (await as(person)).post('/api/v1/courses', { title });
  expect(res.status).toBe(201);
  return CourseAdminView.parse(res.body).id;
}

const base = (courseId: string) => `/api/v1/courses/${courseId}/draft`;

async function outline(courseId: string, person: Person = 'adminA') {
  const res = await (await as(person)).get(`${base(courseId)}/content`);
  expect(res.status).toBe(200);
  return CourseContentView.parse(res.body);
}

/** Runs one change with the current token and returns the new outline. */
async function change(
  courseId: string,
  method: 'post' | 'patch' | 'put' | 'delete',
  path: string,
  body: Record<string, unknown> = {},
  person: Person = 'adminA',
) {
  const { version } = await outline(courseId);
  const s = await as(person);
  const res =
    method === 'delete'
      ? await s.delete(`${base(courseId)}${path}?version=${version}`)
      : await s[method](`${base(courseId)}${path}`, { version, ...body });
  return res;
}

async function ok(res: { status: number; body: unknown }, status = 200) {
  expect(res.status, JSON.stringify(res.body)).toBe(status);
  return CourseContentView.parse(res.body);
}

/** A course with two modules: "Prepare" (text, link) and "Practise" (video). */
async function built() {
  const id = await course();
  await ok(await change(id, 'post', '/modules', { title: 'Prepare' }), 201);
  let view = await ok(await change(id, 'post', '/modules', { title: 'Practise' }), 201);
  const [prepare, practise] = view.modules.map((m) => m.id);
  await ok(
    await change(id, 'post', `/modules/${prepare}/lessons`, {
      title: 'Why isolate',
      type: 'text',
      body: '## Hazards\n\nStored energy can move.\n\n- Lock\n- Tag',
      durationMinutes: 5,
    }),
    201,
  );
  await ok(
    await change(id, 'post', `/modules/${prepare}/lessons`, {
      title: 'Regulation',
      type: 'link',
      url: 'https://example.com/loto',
      required: false,
    }),
    201,
  );
  view = await ok(
    await change(id, 'post', `/modules/${practise!}/lessons`, { title: 'Demo', type: 'video' }),
    201,
  );
  return { id, prepare: prepare!, practise: practise!, view };
}

const titles = (view: CourseContentView) =>
  view.modules.map((m) => `${m.title}: ${m.lessons.map((l) => l.title).join(', ')}`);

describe('building an outline (D-041, D-136, D-137)', () => {
  it('a Tenant Admin adds modules and lessons; rules, gaps and totals are computed by the server; each change is audited', async () => {
    const { id, view } = await built();
    expect(titles(view)).toEqual(['Prepare: Why isolate, Regulation', 'Practise: Demo']);
    const [text, link] = view.modules[0]!.lessons;
    expect(text).toMatchObject({
      type: 'text',
      completionRule: 'manual',
      required: true,
      missing: null,
    });
    expect(link).toMatchObject({
      type: 'link',
      completionRule: 'manual',
      required: false,
      url: 'https://example.com/loto',
      missing: null,
    });
    expect(view.modules[1]!.lessons[0]).toMatchObject({
      type: 'video',
      completionRule: 'watched_90',
      missing: 'file',
    });
    expect(view).toMatchObject({
      canEdit: true,
      totals: { modules: 2, lessons: 3, durationMinutes: 5 },
    });
    // Five changes after creation: the shared draft token moved from 1 to 6.
    expect(view.version).toBe(6);
    const actions = (
      await db.auditEvent.findMany({
        // The fixture's own membership events are not part of this story.
        where: { tenantId: f.tenant.A, entityType: { in: ['course', 'course_module', 'lesson'] } },
        orderBy: { occurredAt: 'asc' },
      })
    ).map((e) => e.action);
    expect(actions).toEqual([
      'course.created',
      'course_module.created',
      'course_module.created',
      'lesson.created',
      'lesson.created',
      'lesson.created',
    ]);
    const created = await db.auditEvent.findFirstOrThrow({
      where: { action: 'lesson.created', entityId: text!.id },
    });
    // Text is recorded as set, never by value.
    expect(JSON.stringify(created.after)).not.toContain('Stored energy');
    const detail = LessonDetailView.parse(
      (await (await as('adminA')).get(`${base(id)}/lessons/${text!.id}`)).body,
    );
    expect(detail.body).toBe('## Hazards\n\nStored energy can move.\n\n- Lock\n- Tag');
  });

  it('every lesson type gets its own completion rule; a quiz waits for its assessment (Phase 4.4)', async () => {
    const id = await course();
    const mod = (await ok(await change(id, 'post', '/modules', { title: 'All' }), 201)).modules[0]!
      .id;
    for (const type of ['text', 'video', 'document', 'link', 'assessment']) {
      await ok(await change(id, 'post', `/modules/${mod}/lessons`, { title: type, type }), 201);
    }
    const lessons = (await outline(id)).modules[0]!.lessons;
    expect(lessons.map((l) => [l.type, l.completionRule, l.missing])).toEqual([
      ['text', 'manual', 'body'],
      ['video', 'watched_90', 'file'],
      ['document', 'acknowledged', 'file'],
      ['link', 'manual', 'url'],
      ['assessment', 'passed', 'assessment'],
    ]);
  });

  it('reordering modules and lessons persists, positions stay 0…n-1, and the order is audited', async () => {
    const { id, prepare, practise, view } = await built();
    const [text, link] = view.modules[0]!.lessons.map((l) => l.id);
    await ok(await change(id, 'put', '/modules/order', { ids: [practise, prepare] }));
    await ok(await change(id, 'put', `/modules/${prepare}/lessons/order`, { ids: [link, text] }));
    expect(titles(await outline(id))).toEqual([
      'Practise: Demo',
      'Prepare: Regulation, Why isolate',
    ]);
    expect(
      (
        await db.lesson.findMany({ where: { moduleId: prepare }, orderBy: { position: 'asc' } })
      ).map((l) => [l.title, l.position]),
    ).toEqual([
      ['Regulation', 0],
      ['Why isolate', 1],
    ]);
    expect(
      await db.auditEvent.findFirstOrThrow({ where: { action: 'course.modules_reordered' } }),
    ).toMatchObject({ entityId: id, after: { moduleIds: [practise, prepare] } });
  });

  it('a reorder must name every item exactly once', async () => {
    const { id, prepare, practise, view } = await built();
    const [text] = view.modules[0]!.lessons.map((l) => l.id);
    for (const ids of [[prepare], [prepare, prepare], [prepare, practise, text]]) {
      const res = await change(id, 'put', '/modules/order', { ids });
      expect(res.status).toBe(422);
      expect(res.body.error.fieldErrors[0]).toMatchObject({
        field: 'ids',
        code: 'not_a_permutation',
      });
    }
    expect(titles(await outline(id))[0]).toBe('Prepare: Why isolate, Regulation');
  });

  it('a lesson moves within its module and into another; both modules close their gaps', async () => {
    const { id, practise, view } = await built();
    const [text, link] = view.modules[0]!.lessons.map((l) => l.id);
    await ok(
      await change(id, 'post', `/lessons/${link}/move`, {
        moduleId: view.modules[0]!.id,
        position: 0,
      }),
    );
    expect(titles(await outline(id))[0]).toBe('Prepare: Regulation, Why isolate');
    await ok(
      await change(id, 'post', `/lessons/${text}/move`, { moduleId: practise, position: 0 }),
    );
    expect(titles(await outline(id))).toEqual([
      'Prepare: Regulation',
      'Practise: Why isolate, Demo',
    ]);
    // A position past the end puts it last.
    await ok(
      await change(id, 'post', `/lessons/${link}/move`, { moduleId: practise, position: 99 }),
    );
    expect(titles(await outline(id))).toEqual([
      'Prepare: ',
      'Practise: Why isolate, Demo, Regulation',
    ]);
    expect(
      (
        await db.lesson.findMany({ where: { moduleId: practise }, orderBy: { position: 'asc' } })
      ).map((l) => l.position),
    ).toEqual([0, 1, 2]);
  });

  it('deleting a module deletes its lessons; deleting a lesson closes the gap; both audited', async () => {
    const { id, prepare, view } = await built();
    const [text] = view.modules[0]!.lessons.map((l) => l.id);
    await ok(await change(id, 'delete', `/lessons/${text}`));
    expect(titles(await outline(id))[0]).toBe('Prepare: Regulation');
    expect((await db.lesson.findFirstOrThrow({ where: { moduleId: prepare } })).position).toBe(0);
    const after = await ok(await change(id, 'delete', `/modules/${prepare}`));
    expect(titles(after)).toEqual(['Practise: Demo']);
    expect(await db.courseModule.findFirstOrThrow()).toMatchObject({ position: 0 });
    expect(await db.lesson.count()).toBe(1);
    expect(
      await db.auditEvent.findFirstOrThrow({ where: { action: 'course_module.deleted' } }),
    ).toMatchObject({ entityId: prepare, before: { title: 'Prepare', lessons: 1 } });
  });

  it('a lesson is edited: title, required, duration and its own content; text and addresses audited without values', async () => {
    const { id, view } = await built();
    const [text, link] = view.modules[0]!.lessons.map((l) => l.id);
    await ok(
      await change(id, 'patch', `/lessons/${text}`, {
        title: 'Why we isolate',
        required: false,
        body: 'New text',
      }),
    );
    await ok(
      await change(id, 'patch', `/lessons/${link}`, { url: 'https://example.org/rules?x=1' }),
    );
    const lessons = (await outline(id)).modules[0]!.lessons;
    expect(lessons[0]).toMatchObject({ title: 'Why we isolate', required: false });
    expect(lessons[1]!.url).toBe('https://example.org/rules?x=1');
    const events = await db.auditEvent.findMany({ where: { action: 'lesson.updated' } });
    expect(JSON.stringify(events)).not.toContain('New text');
    expect(JSON.stringify(events)).not.toContain('example.org');
    // Clearing the text makes the lesson incomplete again.
    await ok(await change(id, 'patch', `/lessons/${text}`, { body: '' }));
    expect((await outline(id)).modules[0]!.lessons[0]!.missing).toBe('body');
  });

  it('content that does not fit the type, unsafe text or addresses, and a type change are refused (422)', async () => {
    const { id, prepare, view } = await built();
    const [text, link] = view.modules[0]!.lessons.map((l) => l.id);
    const cases: [string, Record<string, unknown>, string][] = [
      [`/lessons/${link}`, { body: 'text on a link' }, 'body'],
      [`/lessons/${text}`, { url: 'https://example.com' }, 'url'],
      [`/lessons/${text}`, { assetId: '0195a3e2-0000-7000-8000-000000000000' }, 'assetId'],
      [`/lessons/${link}`, { url: 'http://example.com' }, 'url'],
      [`/lessons/${link}`, { url: 'javascript:alert(1)' }, 'url'],
      [`/lessons/${link}`, { url: 'https://user:pw@example.com' }, 'url'],
      [`/lessons/${text}`, { body: 'reversed ‮ text' }, 'body'],
      [`/lessons/${text}`, { body: 'x'.repeat(20_001) }, 'body'],
      // The type is fixed (D-137): an unknown field for this body, reported at the root like every strict body.
      [`/lessons/${text}`, { type: 'video' }, '(root)'],
      [`/lessons/${text}`, { title: '   ' }, 'title'],
    ];
    for (const [path, body, fieldName] of cases) {
      const res = await change(id, 'patch', path, body);
      expect(res.status, JSON.stringify(body).slice(0, 60)).toBe(422);
      expect(res.body.error.fieldErrors[0].field).toBe(fieldName);
    }
    const res = await change(id, 'post', `/modules/${prepare}/lessons`, {
      title: 'Bad',
      type: 'link',
      body: 'no',
    });
    expect(res.status).toBe(422);
    expect(await db.lesson.count()).toBe(3);
  });

  it('a stale token is a 409 and nothing changes; concurrent changes from one token: one wins', async () => {
    const { id, prepare } = await built();
    const { version } = await outline(id);
    const admin = await as('adminA');
    const first = await admin.patch(`${base(id)}/modules/${prepare}`, { version, title: 'First' });
    expect(first.status).toBe(200);
    const stale = await admin.patch(`${base(id)}/modules/${prepare}`, { version, title: 'Second' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CONFLICT');
    const deleted = await admin.delete(`${base(id)}/modules/${prepare}?version=${version}`);
    expect(deleted.status).toBe(409);
    expect(titles(await outline(id))[0]).toMatch(/^First:/);

    const now = (await outline(id)).version;
    const results = await Promise.all(
      ['A', 'B', 'C'].map((t) => admin.post(`${base(id)}/modules`, { version: now, title: t })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect((await outline(id)).modules).toHaveLength(3);
  });

  it('the basics form and the outline share one token (D-137)', async () => {
    const { id } = await built();
    const { version } = await outline(id);
    await ok(await change(id, 'post', '/modules', { title: 'Third' }), 201);
    const res = await (
      await as('adminA')
    ).patch(`/api/v1/courses/${id}/draft`, {
      version,
      title: 'Renamed',
    });
    expect(res.status).toBe(409);
  });

  it('outline limits: 50 modules, 100 lessons per module (409 CONTENT_LIMIT)', async () => {
    const id = await course();
    const draft = await db.courseVersion.findFirstOrThrow({ where: { courseId: id } });
    await db.courseModule.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        tenantId: f.tenant.A,
        courseVersionId: draft.id,
        position: i,
        title: `M${i}`,
      })),
    });
    const res = await change(id, 'post', '/modules', { title: 'One too many' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONTENT_LIMIT');
    const first = await db.courseModule.findFirstOrThrow({ where: { position: 0 } });
    await db.lesson.createMany({
      data: Array.from({ length: 100 }, (_, i) => ({
        tenantId: f.tenant.A,
        courseVersionId: draft.id,
        moduleId: first.id,
        position: i,
        title: `L${i}`,
        type: 'text' as const,
        completionRule: 'manual' as const,
      })),
    });
    const lesson = await change(id, 'post', `/modules/${first.id}/lessons`, {
      title: 'X',
      type: 'text',
    });
    expect(lesson.status).toBe(409);
    expect(lesson.body.error.code).toBe('CONTENT_LIMIT');
  });
});

describe('lesson files (D-136, D-138)', () => {
  it('a document lesson takes a document; wrong kinds, failed files and other tenants’ files are refused', async () => {
    const { id, prepare } = await built();
    const doc = await upload('adminA', 'document', PDF, 'Procedure.pdf');
    const video = await upload('adminA', 'video', MP4, 'clip.mp4');
    const otherTenant = await upload('adminB', 'document', PDF, 'Theirs.pdf');
    const add = (assetId: string) =>
      change(id, 'post', `/modules/${prepare}/lessons`, {
        title: 'Procedure',
        type: 'document',
        assetId,
      });
    for (const [assetId, code] of [
      [video.id, 'wrong_kind'],
      [otherTenant.id, 'not_found'],
    ] as const) {
      const res = await add(assetId);
      expect(res.status).toBe(422);
      expect(res.body.error.fieldErrors[0]).toMatchObject({ field: 'assetId', code });
    }
    await db.asset.update({
      where: { id: video.id },
      data: { status: 'failed', failedAt: new Date(), failureReason: 'test' },
    });
    const failed = await change(id, 'post', `/modules/${prepare}/lessons`, {
      title: 'Clip',
      type: 'video',
      assetId: video.id,
    });
    expect(failed.body.error.fieldErrors[0]).toMatchObject({ field: 'assetId', code: 'failed' });
    const view = await ok(await add(doc.id), 201);
    expect(view.modules[0]!.lessons[2]).toMatchObject({
      asset: { id: doc.id, kind: 'document', fileName: 'Procedure.pdf', status: 'ready' },
      missing: null,
    });
    expect(await db.lesson.count({ where: { assetId: { not: null } } })).toBe(1);
  });

  it('a processing video can be attached; a file failing later shows as missing', async () => {
    const { id, view } = await built();
    const demo = view.modules[1]!.lessons[0]!.id;
    const video = await upload('adminA', 'video', MP4, 'clip.mp4');
    const after = await ok(await change(id, 'patch', `/lessons/${demo}`, { assetId: video.id }));
    expect(after.modules[1]!.lessons[0]).toMatchObject({
      asset: { status: 'processing' },
      missing: null,
    });
    await db.asset.update({
      where: { id: video.id },
      data: { status: 'failed', failedAt: new Date(), failureReason: 'test' },
    });
    expect((await outline(id)).modules[1]!.lessons[0]).toMatchObject({
      asset: { status: 'failed' },
      missing: 'file',
    });
  });

  it('course readers open a lesson’s file; another tenant never; once detached it is Tenant Admin only again', async () => {
    const { id, prepare } = await built();
    const doc = await upload('adminA', 'document', PDF, 'Procedure.pdf');
    expect((await (await as('baA1')).get(`/api/v1/assets/${doc.id}/access`)).status).toBe(404);
    const view = await ok(
      await change(id, 'post', `/modules/${prepare}/lessons`, {
        title: 'Procedure',
        type: 'document',
        assetId: doc.id,
      }),
      201,
    );
    for (const person of ['baA1', 'lmA1', 'cvA1'] as const) {
      const res = await (await as(person)).get(`/api/v1/assets/${doc.id}/access`);
      expect(res.status, person).toBe(200);
      AssetAccessView.parse(res.body);
    }
    for (const person of ['adminB', 'baB1', 'insA1'] as const) {
      expect((await (await as(person)).get(`/api/v1/assets/${doc.id}/access`)).status, person).toBe(
        404,
      );
    }
    expect((await (await as('learnerA1')).get(`/api/v1/assets/${doc.id}/access`)).status).toBe(403);
    await ok(await change(id, 'delete', `/lessons/${view.modules[0]!.lessons[2]!.id}`));
    expect((await (await as('baA1')).get(`/api/v1/assets/${doc.id}/access`)).status).toBe(404);
    expect((await (await as('adminA')).get(`/api/v1/assets/${doc.id}/access`)).status).toBe(200);
  });
});

describe('who reads and who changes the outline (D-127, D-137)', () => {
  it('course readers read the outline and a lesson read-only; their changes are 403 and change nothing', async () => {
    const { id, prepare, view } = await built();
    const text = view.modules[0]!.lessons[0]!.id;
    for (const person of ['baA1', 'lmA', 'lmA1', 'cvA', 'cvA1'] as const) {
      const read = await outline(id, person);
      expect(read.canEdit, person).toBe(false);
      expect(titles(read)).toEqual(titles(view));
      expect((await (await as(person)).get(`${base(id)}/lessons/${text}`)).status).toBe(200);
      const s = await as(person);
      for (const res of [
        await s.post(`${base(id)}/modules`, { version: read.version, title: 'X' }),
        await s.patch(`${base(id)}/modules/${prepare}`, { version: read.version, title: 'X' }),
        await s.delete(`${base(id)}/modules/${prepare}?version=${read.version}`),
        await s.put(`${base(id)}/modules/order`, { version: read.version, ids: [prepare] }),
        await s.patch(`${base(id)}/lessons/${text}`, { version: read.version, title: 'X' }),
      ]) {
        expect(res.status, person).toBe(403);
      }
    }
    expect(titles(await outline(id))).toEqual(titles(view));
  });

  it('a learner is refused (403); an instructor has no course reach yet (404)', async () => {
    const { id } = await built();
    expect((await (await as('learnerA1')).get(`${base(id)}/content`)).status).toBe(403);
    expect((await (await as('insA1')).get(`${base(id)}/content`)).status).toBe(404);
  });

  it('a support session reads the outline; its changes are refused (403 SUPPORT_READ_ONLY)', async () => {
    const { id, prepare } = await built();
    const staff = await actors.signIn(emailOf('staff'));
    await staff.post('/api/v1/platform/support-sessions', {
      tenantId: f.tenant.A,
      reason: 'Ticket 21: outline',
    });
    const read = await staff.get(`${base(id)}/content`);
    expect(read.status).toBe(200);
    expect(read.body.canEdit).toBe(false);
    const res = await staff.patch(`${base(id)}/modules/${prepare}`, {
      version: read.body.version,
      title: 'X',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SUPPORT_READ_ONLY');
  });

  it('live revocation: a Tenant Admin whose role was removed cannot change the outline any more', async () => {
    const { id, prepare } = await built();
    const admin = await as('adminA');
    const { version } = await outline(id);
    await db.roleAssignment.updateMany({
      where: { membershipId: f.member.adminA },
      data: { revokedAt: new Date(), revokedReason: 'test' },
    });
    const res = await admin.patch(`${base(id)}/modules/${prepare}`, { version, title: 'X' });
    expect([403, 401]).toContain(res.status);
    expect((await db.courseModule.findUniqueOrThrow({ where: { id: prepare } })).title).toBe(
      'Prepare',
    );
  });
});

describe('ids from elsewhere (isolation)', () => {
  it('another tenant gets 404 on every outline route for tenant A’s course, and nothing changes', async () => {
    const { id, prepare, view } = await built();
    const text = view.modules[0]!.lessons[0]!.id;
    for (const person of ['adminB', 'baB1'] as const) {
      const s = await as(person);
      const v = view.version;
      const responses = [
        await s.get(`${base(id)}/content`),
        await s.get(`${base(id)}/lessons/${text}`),
        await s.post(`${base(id)}/modules`, { version: v, title: 'X' }),
        await s.patch(`${base(id)}/modules/${prepare}`, { version: v, title: 'X' }),
        await s.delete(`${base(id)}/modules/${prepare}?version=${v}`),
        await s.put(`${base(id)}/modules/order`, { version: v, ids: [prepare] }),
        await s.put(`${base(id)}/modules/${prepare}/lessons/order`, { version: v, ids: [text] }),
        await s.post(`${base(id)}/modules/${prepare}/lessons`, {
          version: v,
          title: 'X',
          type: 'text',
        }),
        await s.patch(`${base(id)}/lessons/${text}`, { version: v, title: 'X' }),
        await s.post(`${base(id)}/lessons/${text}/move`, {
          version: v,
          moduleId: prepare,
          position: 0,
        }),
        await s.delete(`${base(id)}/lessons/${text}?version=${v}`),
      ];
      // baB1 has no course.update: 403 before any lookup on writes; reads and adminB's writes are 404.
      for (const [i, res] of responses.entries()) {
        const expected = person === 'baB1' && i >= 2 ? 403 : 404;
        expect(res.status, `${person} #${i}`).toBe(expected);
      }
    }
    expect(titles(await outline(id))).toEqual(titles(view));
    expect((await outline(id)).version).toBe(view.version);
  });

  it('tenant A’s modules and lessons are 404 under tenant B’s own course', async () => {
    const { prepare, view } = await built();
    const text = view.modules[0]!.lessons[0]!.id;
    const theirs = await course('adminB', 'Their course');
    const b = await outline(theirs, 'adminB');
    const s = await as('adminB');
    for (const res of [
      await s.get(`${base(theirs)}/lessons/${text}`),
      await s.patch(`${base(theirs)}/modules/${prepare}`, { version: b.version, title: 'X' }),
      await s.post(`${base(theirs)}/modules/${prepare}/lessons`, {
        version: b.version,
        title: 'X',
        type: 'text',
      }),
      await s.patch(`${base(theirs)}/lessons/${text}`, { version: b.version, title: 'X' }),
      await s.delete(`${base(theirs)}/lessons/${text}?version=${b.version}`),
    ]) {
      expect(res.status).toBe(404);
    }
    expect(await db.lesson.count({ where: { tenantId: f.tenant.B } })).toBe(0);
  });

  it('a module or lesson of another course in the same tenant is 404; a lesson never moves into another course', async () => {
    const { id, prepare, view } = await built();
    const text = view.modules[0]!.lessons[0]!.id;
    const other = await course('adminA', 'Forklift basics');
    const otherModule = (
      await ok(await change(other, 'post', '/modules', { title: 'Theirs' }), 201)
    ).modules[0]!.id;
    expect((await change(id, 'patch', `/modules/${otherModule}`, { title: 'X' })).status).toBe(404);
    expect(
      (await change(id, 'post', `/lessons/${text}/move`, { moduleId: otherModule, position: 0 }))
        .status,
    ).toBe(404);
    expect((await change(other, 'patch', `/lessons/${text}`, { title: 'X' })).status).toBe(404);
    expect(
      (await change(other, 'put', `/modules/${prepare}/lessons/order`, { ids: [text] })).status,
    ).toBe(404);
    expect((await db.lesson.findUniqueOrThrow({ where: { id: text } })).moduleId).toBe(prepare);
  });
});

describe('database rules (D-041, D-136, D-137)', () => {
  async function draftOf(courseId: string) {
    return db.courseVersion.findFirstOrThrow({ where: { courseId } });
  }

  it('a published version’s outline is frozen: no insert, update or delete of modules or lessons', async () => {
    const { id, prepare, view } = await built();
    const draft = await draftOf(id);
    await db.courseVersion.update({
      where: { id: draft.id },
      data: {
        status: 'published',
        versionNumber: 1,
        publishedAt: new Date(),
        publishedById: f.user.adminA,
      },
    });
    const text = view.modules[0]!.lessons[0]!.id;
    await expect(
      db.courseModule.update({ where: { id: prepare }, data: { title: 'X' } }),
    ).rejects.toThrow(/course_content_frozen/);
    await expect(db.courseModule.delete({ where: { id: prepare } })).rejects.toThrow(
      /course_content_frozen/,
    );
    await expect(
      db.courseModule.create({
        data: { tenantId: f.tenant.A, courseVersionId: draft.id, position: 9, title: 'X' },
      }),
    ).rejects.toThrow(/course_content_frozen/);
    await expect(db.lesson.update({ where: { id: text }, data: { title: 'X' } })).rejects.toThrow(
      /course_content_frozen/,
    );
    await expect(db.lesson.delete({ where: { id: text } })).rejects.toThrow(
      /course_content_frozen/,
    );
    // And the API answers NO_DRAFT: there is no draft to change.
    expect((await (await as('adminA')).get(`${base(id)}/content`)).status).toBe(409);
  });

  it('a lesson’s module must be in the same version and tenant; a lesson never changes type or version', async () => {
    const { id, prepare, view } = await built();
    const text = view.modules[0]!.lessons[0]!.id;
    const other = await course('adminA', 'Forklift basics');
    const otherDraft = await draftOf(other);
    await expect(
      db.lesson.update({ where: { id: text }, data: { courseVersionId: otherDraft.id } }),
    ).rejects.toThrow();
    await expect(
      db.lesson.create({
        data: {
          tenantId: f.tenant.B,
          courseVersionId: (await draftOf(id)).id,
          moduleId: prepare,
          position: 9,
          title: 'X',
          type: 'text',
          completionRule: 'manual',
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.lesson.update({
        where: { id: text },
        data: { type: 'link', completionRule: 'manual', body: null },
      }),
    ).rejects.toThrow(/type and completion rule never change/);
  });

  it('CHECKs: rule fits type, content fits type, https only; the file fits the type', async () => {
    const { id, prepare } = await built();
    const draft = await draftOf(id);
    const lesson = (data: Record<string, unknown>) =>
      db.lesson.create({
        data: {
          tenantId: f.tenant.A,
          courseVersionId: draft.id,
          moduleId: prepare,
          position: 50,
          title: 'X',
          type: 'text',
          completionRule: 'manual',
          ...data,
        } as never,
      });
    await expect(lesson({ type: 'video', completionRule: 'manual' })).rejects.toThrow(
      /lessons_rule_fits_type/,
    );
    await expect(lesson({ type: 'link', url: 'https://x.test', body: 'x' })).rejects.toThrow(
      /lessons_content_fits_type/,
    );
    await expect(lesson({ type: 'link', url: 'http://x.test' })).rejects.toThrow(
      /lessons_url_https/,
    );
    const video = await upload('adminA', 'video', MP4, 'clip.mp4');
    await expect(
      lesson({ type: 'document', completionRule: 'acknowledged', assetId: video.id }),
    ).rejects.toThrow(/lessons_asset_fits/);
  });
});

describe('review fixes (isolation audit and security review 3.5a)', () => {
  it('a change that changes nothing keeps the token and writes no audit entry', async () => {
    const { id, prepare, practise, view } = await built();
    const [text, link] = view.modules[0]!.lessons.map((l) => l.id);
    const audits = () => db.auditEvent.count({ where: { tenantId: f.tenant.A } });
    const before = await audits();
    for (const [method, path, body] of [
      ['patch', `/modules/${prepare}`, { title: 'Prepare' }],
      ['put', '/modules/order', { ids: [prepare, practise] }],
      ['put', `/modules/${prepare}/lessons/order`, { ids: [text, link] }],
      ['patch', `/lessons/${text}`, { title: 'Why isolate', durationMinutes: 5 }],
      ['post', `/lessons/${link}/move`, { moduleId: prepare, position: 1 }],
    ] as const) {
      const res = await change(id, method, path, body);
      expect(res.status, path).toBe(200);
      expect(res.body.version, path).toBe(view.version);
    }
    expect(await audits()).toBe(before);
  });

  it('a reorder with another course’s id or another module’s lesson swapped in is refused and changes nothing', async () => {
    const { id, prepare, practise, view } = await built();
    const [text] = view.modules[0]!.lessons.map((l) => l.id);
    const video = view.modules[1]!.lessons[0]!.id;
    const other = await course('adminA', 'Forklift basics');
    const otherModule = (
      await ok(await change(other, 'post', '/modules', { title: 'Theirs' }), 201)
    ).modules[0]!.id;
    const modules = await change(id, 'put', '/modules/order', { ids: [practise, otherModule] });
    expect(modules.status).toBe(422);
    const lessons = await change(id, 'put', `/modules/${prepare}/lessons/order`, {
      ids: [video, text],
    });
    expect(lessons.status).toBe(422);
    expect(titles(await outline(id))).toEqual(titles(view));
  });

  it('another tenant’s module as a move target is 404; another tenant’s file in a lesson edit is 422', async () => {
    const { id, view } = await built();
    const text = view.modules[0]!.lessons[0]!.id;
    const demo = view.modules[1]!.lessons[0]!.id;
    const theirs = await course('adminB', 'Their course');
    const b = await outline(theirs, 'adminB');
    const theirModule = (
      await ok(
        await (
          await as('adminB')
        ).post(`${base(theirs)}/modules`, { version: b.version, title: 'Theirs' }),
        201,
      )
    ).modules[0]!.id;
    expect(
      (await change(id, 'post', `/lessons/${text}/move`, { moduleId: theirModule, position: 0 }))
        .status,
    ).toBe(404);
    const theirFile = await upload('adminB', 'video', MP4, 'theirs.mp4');
    const res = await change(id, 'patch', `/lessons/${demo}`, { assetId: theirFile.id });
    expect(res.status).toBe(422);
    expect(res.body.error.fieldErrors[0]).toMatchObject({ field: 'assetId', code: 'not_found' });
    expect((await db.lesson.findUniqueOrThrow({ where: { id: demo } })).assetId).toBeNull();
  });

  it('a lesson’s file stays readable through a published version; a support session reads it too', async () => {
    const { id, prepare } = await built();
    const doc = await upload('adminA', 'document', PDF, 'Procedure.pdf');
    await ok(
      await change(id, 'post', `/modules/${prepare}/lessons`, {
        title: 'Procedure',
        type: 'document',
        assetId: doc.id,
      }),
      201,
    );
    // Publishing arrives in 3.6; until then the version is published directly.
    await db.courseVersion.updateMany({
      where: { courseId: id },
      data: {
        status: 'published',
        versionNumber: 1,
        publishedAt: new Date(),
        publishedById: f.user.adminA,
      },
    });
    expect((await (await as('lmA')).get(`/api/v1/assets/${doc.id}/access`)).status).toBe(200);
    const staff = await actors.signIn(emailOf('staff'));
    await staff.post('/api/v1/platform/support-sessions', {
      tenantId: f.tenant.A,
      reason: 'Ticket 22: files',
    });
    expect((await staff.get(`/api/v1/assets/${doc.id}/access`)).status).toBe(200);
    expect((await (await as('baB1')).get(`/api/v1/assets/${doc.id}/access`)).status).toBe(404);
  });

  it('the database refuses a lesson moved into another draft’s module, and a link with credentials', async () => {
    const { id, view } = await built();
    const text = view.modules[0]!.lessons[0]!.id;
    const link = view.modules[0]!.lessons[1]!.id;
    const other = await course('adminA', 'Forklift basics');
    const otherModule = (
      await ok(await change(other, 'post', '/modules', { title: 'Theirs' }), 201)
    ).modules[0]!.id;
    await expect(
      db.lesson.update({ where: { id: text }, data: { moduleId: otherModule } }),
    ).rejects.toThrow();
    await expect(
      db.lesson.update({ where: { id: link }, data: { url: 'https://user:pw@example.com/' } }),
    ).rejects.toThrow(/lessons_url_https/);
    expect((await db.lesson.findUniqueOrThrow({ where: { id: text } })).moduleId).toBe(
      view.modules[0]!.id,
    );
    expect(id).toBeTruthy();
  });
});
