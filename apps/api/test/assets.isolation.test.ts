import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { AssetAccessView, AssetView, CourseAdminView } from '@vachelearn/contracts';
import request from 'supertest';
import type { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../src/auth/passwords';
import { JobsService } from '../src/jobs/jobs.service';
import { StorageService } from '../src/storage/storage.service';
import { createTestApp, LogCapture, WEB } from './app';
import { resetDatabase, testPrisma } from './db';
import { realActors, TEST_PASSWORD } from './sessions';
import { buildTwoTenants, emailOf, type Person, type TwoTenants } from './two-tenants';

/*
 * Assets (Slice 3.4; phase AC: another tenant cannot obtain a signed URL for an asset; a disallowed type is rejected;
 * signed URLs are never logged; D-131–D-135) through real sessions, real Postgres and the local RustFS test bucket.
 */

let app: INestApplication;
let db: PrismaClient;
let actors: ReturnType<typeof realActors>;
let f: TwoTenants;
const logs = new LogCapture();

beforeAll(async () => {
  ({ app } = await createTestApp({ logs }));
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

// ── Small real files (the API detects the type from these bytes) ─────────────────────────────────────────────────
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
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
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0x90)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

async function upload(person: Person, kind: string, content: Buffer, name: string) {
  return (await as(person)).upload(`/api/v1/assets?kind=${kind}`, content, name);
}
async function image(person: Person = 'adminA') {
  const res = await upload(person, 'image', PNG, 'cover.png');
  expect(res.status).toBe(201);
  return AssetView.parse(res.body);
}
async function course(person: Person, title: string) {
  const res = await (await as(person)).post('/api/v1/courses', { title });
  expect(res.status).toBe(201);
  return CourseAdminView.parse(res.body);
}
async function setCover(person: Person, c: CourseAdminView, coverAssetId: string | null) {
  return (await as(person)).patch(`/api/v1/courses/${c.id}/draft`, {
    version: c.draft!.version,
    coverAssetId,
  });
}
const storage = () => app.get(StorageService);
const keyOf = async (id: string) =>
  (await db.asset.findUniqueOrThrow({ where: { id } })).storageKey;

describe('uploading (D-131, D-132, D-134)', () => {
  it('a Tenant Admin uploads an image: type from the contents, size and checksum recorded, stored, audited', async () => {
    const asset = await image();
    expect(asset).toMatchObject({
      kind: 'image',
      status: 'ready',
      contentType: 'image/png',
      sizeBytes: PNG.length,
      sha256: createHash('sha256').update(PNG).digest('hex'),
      fileName: 'cover.png',
      scanStatus: 'not_scanned',
    });
    expect(asset).not.toHaveProperty('storageKey');
    const row = await db.asset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(row.storageKey).toMatch(
      new RegExp(
        `^tenants/${f.tenant.A}/image/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
      ),
    );
    expect(await storage().exists(row.storageKey)).toBe(true);
    expect(
      await db.auditEvent.findFirst({ where: { action: 'asset.uploaded', entityId: asset.id } }),
    ).toMatchObject({ tenantId: f.tenant.A, actorUserId: f.user.adminA });
  });

  it('a PDF document and an MP4 video are accepted; the browser-sent name is cleaned', async () => {
    const doc = await upload('adminA', 'document', PDF, '../../etc/Safety‮ manual.pdf');
    expect(doc.status).toBe(201);
    expect(doc.body).toMatchObject({
      contentType: 'application/pdf',
      fileName: 'Safety manual.pdf',
    });
    const video = await upload('adminA', 'video', MP4, 'induction.mp4');
    expect(video.status).toBe(201);
    expect(video.body).toMatchObject({ contentType: 'video/mp4', status: 'processing' });
  });

  it('disallowed or mismatched types are refused (422) and nothing is stored', async () => {
    for (const [kind, content, name] of [
      ['image', EXE, 'cover.png'],
      ['image', SVG, 'logo.svg'],
      ['image', PDF, 'cover.png'],
      ['document', PNG, 'manual.pdf'],
      ['document', EXE, 'manual.pdf'],
      ['video', PNG, 'clip.mp4'],
    ] as const) {
      const res = await upload('adminA', kind, content, name);
      expect(res.status, `${kind} ${name}`).toBe(422);
      expect(res.body.error.fieldErrors[0]).toMatchObject({
        field: 'file',
        code: 'type_not_allowed',
      });
    }
    expect(await db.asset.count()).toBe(0);
  });

  it('a file over the kind limit is refused as too large; an empty file and a missing file are refused', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024, 1)]);
    const tooBig = await upload('adminA', 'image', big, 'huge.png');
    expect(tooBig.status).toBe(422);
    expect(tooBig.body.error.fieldErrors[0].code).toBe('too_large');
    expect((await upload('adminA', 'image', Buffer.alloc(0), 'empty.png')).status).toBe(422);
    const none = await (await as('adminA')).post('/api/v1/assets?kind=image', {});
    expect(none.status).toBe(422);
    expect((await upload('adminA', 'spreadsheet', PNG, 'x.png')).status).toBe(422);
    expect(await db.asset.count()).toBe(0);
  });

  it('only a Tenant Admin uploads: other roles 403, support sessions read-only, anonymous 401', async () => {
    for (const person of ['baA1', 'lmA', 'cvA', 'insA1', 'learnerA1'] as const) {
      expect((await upload(person, 'image', PNG, 'x.png')).status, person).toBe(403);
    }
    const staff = await actors.signIn(emailOf('staff'));
    await staff.post('/api/v1/platform/support-sessions', {
      tenantId: f.tenant.A,
      reason: 'Ticket 16: assets',
    });
    expect((await staff.upload('/api/v1/assets?kind=image', PNG, 'x.png')).status).toBe(403);
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/assets?kind=image')
          .set('origin', WEB)
          .attach('file', PNG, 'x.png')
      ).status,
    ).toBe(401);
    expect(await db.asset.count()).toBe(0);
  });

  it('multipart bodies are refused on every other route (415): only the upload route opts in', async () => {
    for (const path of ['/api/v1/courses', '/api/v1/categories']) {
      expect((await (await as('adminA')).upload(path, PNG, 'x.png')).status, path).toBe(415);
    }
    expect(await db.course.count()).toBe(0);
  });

  it('a Tenant Admin whose role was revoked after signing in cannot upload (live reach)', async () => {
    const admin = await as('adminA');
    await db.roleAssignment.updateMany({
      where: { membershipId: f.member.adminA, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: f.user.adminA, revokedReason: 'Moved on' },
    });
    expect([403, 404]).toContain(
      (await admin.upload('/api/v1/assets?kind=image', PNG, 'x.png')).status,
    );
    expect(await db.asset.count()).toBe(0);
  });
});

describe('signed links (D-133, D-135)', () => {
  it('the uploader gets a 5-minute link that serves the file with its checked type; content redirects to it', async () => {
    const asset = await image();
    const res = await (await as('adminA')).get(`/api/v1/assets/${asset.id}/access`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const link = AssetAccessView.parse(res.body);
    const lifetime = Date.parse(link.expiresAt) - Date.now();
    expect(lifetime).toBeGreaterThan(290_000);
    expect(lifetime).toBeLessThanOrEqual(300_000);
    expect(new URL(link.url).searchParams.get('X-Amz-Expires')).toBe('300');
    const fetched = await fetch(link.url);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await fetched.arrayBuffer()).equals(PNG)).toBe(true);
    const redirect = await (await as('adminA')).get(`/api/v1/assets/${asset.id}/content`);
    expect(redirect.status).toBe(302);
    expect(redirect.headers.location).toContain('X-Amz-Signature=');
    expect(redirect.headers['referrer-policy']).toBe('no-referrer');
  });

  it('a document link downloads as an attachment', async () => {
    const doc = AssetView.parse((await upload('adminA', 'document', PDF, 'Manual.pdf')).body);
    const link = AssetAccessView.parse(
      (await (await as('adminA')).get(`/api/v1/assets/${doc.id}/access`)).body,
    );
    const fetched = await fetch(link.url);
    expect(fetched.headers.get('content-disposition')).toMatch(
      /^attachment; filename="Manual.pdf"/,
    );
  });

  it('tenant B cannot read tenant A assets by id: details, link and content are all 404', async () => {
    const asset = await image();
    const b = await as('adminB');
    for (const path of ['', '/access', '/content']) {
      const res = await b.get(`/api/v1/assets/${asset.id}${path}`);
      expect(res.status, path).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain('X-Amz');
    }
    // A branch admin of tenant B cannot either.
    expect((await (await as('baB1')).get(`/api/v1/assets/${asset.id}/access`)).status).toBe(404);
  });

  it('an unattached asset is for Tenant Admins only; other readers get 404 (D-133)', async () => {
    const asset = await image();
    for (const person of ['baA1', 'lmA', 'cvA', 'insA1'] as const) {
      expect(
        (await (await as(person)).get(`/api/v1/assets/${asset.id}/access`)).status,
        person,
      ).toBe(404);
    }
    // Learners hold no course.read reach yet (entitlement comes in Phase 4).
    expect([403, 404]).toContain(
      (await (await as('learnerA1')).get(`/api/v1/assets/${asset.id}/access`)).status,
    );
  });

  it('a course cover is readable by every course reader (D-127), not by an Instructor', async () => {
    const asset = await image();
    const c = await course('adminA', 'Lockout tagout');
    const saved = await setCover('adminA', c, asset.id);
    expect(saved.status).toBe(200);
    expect(CourseAdminView.parse(saved.body).draft?.cover).toEqual({
      id: asset.id,
      fileName: 'cover.png',
    });
    for (const person of ['baA1', 'lmA1', 'cvA1'] as const) {
      expect(
        (await (await as(person)).get(`/api/v1/assets/${asset.id}/access`)).status,
        person,
      ).toBe(200);
    }
    expect((await (await as('insA1')).get(`/api/v1/assets/${asset.id}/access`)).status).toBe(404);
    const list = await (await as('baA1')).get('/api/v1/courses');
    expect(list.body.data[0].coverAssetId).toBe(asset.id);
    // A support session reads it (read-only).
    const staff = await actors.signIn(emailOf('staff'));
    await staff.post('/api/v1/platform/support-sessions', {
      tenantId: f.tenant.A,
      reason: 'Ticket 17: cover',
    });
    expect((await staff.get(`/api/v1/assets/${asset.id}/access`)).status).toBe(200);
  });

  it('a video has no link until it is ready (409); the job makes it ready once, run twice', async () => {
    const video = AssetView.parse((await upload('adminA', 'video', MP4, 'induction.mp4')).body);
    const early = await (await as('adminA')).get(`/api/v1/assets/${video.id}/access`);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('ASSET_NOT_READY');
    expect(await db.job.count({ where: { type: 'asset.video_check' } })).toBe(1);
    const jobs = app.get(JobsService);
    await jobs.runDue('test-worker');
    await jobs.runDue('test-worker');
    const row = await db.asset.findUniqueOrThrow({ where: { id: video.id } });
    expect(row.status).toBe('ready');
    expect(row.readyAt).not.toBeNull();
    expect(await db.job.count({ where: { type: 'asset.video_check' } })).toBe(1);
    expect((await (await as('adminA')).get(`/api/v1/assets/${video.id}/access`)).status).toBe(200);
  });

  it('a video whose stored file is gone fails with a reason, once', async () => {
    const video = AssetView.parse((await upload('adminA', 'video', MP4, 'induction.mp4')).body);
    await storage().remove(await keyOf(video.id));
    await app.get(JobsService).runDue('test-worker');
    expect(await db.asset.findUniqueOrThrow({ where: { id: video.id } })).toMatchObject({
      status: 'failed',
      failureReason: 'The uploaded video could not be found',
    });
  });

  it('signed links never reach a log line', async () => {
    const asset = await image();
    logs.lines.length = 0;
    const admin = await as('adminA');
    await admin.get(`/api/v1/assets/${asset.id}/access`);
    await admin.get(`/api/v1/assets/${asset.id}/content`);
    expect(logs.lines.length).toBeGreaterThan(0);
    const joined = logs.lines.join('\n');
    expect(joined).not.toMatch(/X-Amz-(Signature|Credential)/);
    expect(joined).not.toContain(await keyOf(asset.id));
  });
});

describe('course covers (D-133)', () => {
  it('a cover must be a ready image of this tenant; another tenant asset reads as unknown', async () => {
    const c = await course('adminA', 'Lockout tagout');
    const theirs = await image('adminB');
    const res = await setCover('adminA', c, theirs.id);
    expect(res.status).toBe(422);
    expect(res.body.error.fieldErrors[0]).toMatchObject({
      field: 'coverAssetId',
      code: 'not_found',
    });
    const doc = AssetView.parse((await upload('adminA', 'document', PDF, 'Manual.pdf')).body);
    expect((await setCover('adminA', c, doc.id)).body.error.fieldErrors[0].code).toBe('not_image');
    const video = AssetView.parse((await upload('adminA', 'video', MP4, 'clip.mp4')).body);
    expect((await setCover('adminA', c, video.id)).body.error.fieldErrors[0].code).toBe(
      'not_image',
    );
    // Removing a cover works, and is audited with ids only.
    const mine = await image();
    const set = CourseAdminView.parse((await setCover('adminA', c, mine.id)).body);
    const removed = await setCover('adminA', set, null);
    expect(removed.status).toBe(200);
    expect(CourseAdminView.parse(removed.body).draft?.cover).toBeNull();
  });
});

describe('database rules (D-135)', () => {
  it('an asset is never deleted and a stored file never changes', async () => {
    const asset = await image();
    await expect(db.asset.delete({ where: { id: asset.id } })).rejects.toThrow(/never deleted/);
    await expect(
      db.asset.update({ where: { id: asset.id }, data: { sha256: 'a'.repeat(64) } }),
    ).rejects.toThrow(/never changes/);
    await expect(
      db.asset.update({ where: { id: asset.id }, data: { status: 'processing', readyAt: null } }),
    ).rejects.toThrow(/only a processing asset/);
  });

  it('the database refuses a cover from another tenant, a non-image cover, and a key naming another tenant', async () => {
    const c = await course('adminA', 'Lockout tagout');
    const theirs = await image('adminB');
    const draft = await db.courseVersion.findFirstOrThrow({ where: { courseId: c.id } });
    await expect(
      db.courseVersion.update({ where: { id: draft.id }, data: { coverAssetId: theirs.id } }),
    ).rejects.toThrow();
    const doc = AssetView.parse((await upload('adminA', 'document', PDF, 'Manual.pdf')).body);
    await expect(
      db.courseVersion.update({ where: { id: draft.id }, data: { coverAssetId: doc.id } }),
    ).rejects.toThrow(/ready image/);
    await expect(
      db.asset.create({
        data: {
          tenantId: f.tenant.A,
          kind: 'image',
          status: 'ready',
          readyAt: new Date(),
          storageKey: `tenants/${f.tenant.B}/image/0f8fad5b-d9cb-469f-a165-70867728950e`,
          contentType: 'image/png',
          sizeBytes: 10,
          sha256: 'b'.repeat(64),
          fileName: 'x.png',
          provider: 'storage',
          scanStatus: 'not_scanned',
        },
      }),
    ).rejects.toThrow(/assets_key_shape/);
    await expect(
      db.asset.create({
        data: {
          tenantId: f.tenant.A,
          kind: 'image',
          status: 'ready',
          readyAt: new Date(),
          storageKey: `tenants/${f.tenant.A}/image/0f8fad5b-d9cb-469f-a165-70867728950e`,
          contentType: 'image/svg+xml',
          sizeBytes: 10,
          sha256: 'b'.repeat(64),
          fileName: 'x.svg',
          provider: 'storage',
          scanStatus: 'not_scanned',
        },
      }),
    ).rejects.toThrow(/assets_type_allowed/);
  });

  it('a published version keeps its cover', async () => {
    const asset = await image();
    const c = await course('adminA', 'Lockout tagout');
    await setCover('adminA', c, asset.id);
    const draft = await db.courseVersion.findFirstOrThrow({ where: { courseId: c.id } });
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
      db.courseVersion.update({ where: { id: draft.id }, data: { coverAssetId: null } }),
    ).rejects.toThrow(/published course version cannot change/);
  });
});

// ── Review fixes (isolation audit and security review 3.4) ────────────────────────────────────────────────────────

/** A raw HTTP client on a listening copy of the app: lets a test cut an upload off or declare any Content-Length. */
async function rawServer() {
  const server = app.getHttpServer() as import('node:http').Server;
  if (!server.listening) await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return (server.address() as import('node:net').AddressInfo).port;
}
const BOUNDARY = 'vlboundary1234';
function uploadHead(session: Session, length: number, kind = 'video') {
  return [
    `POST /api/v1/assets?kind=${kind} HTTP/1.1`,
    'Host: 127.0.0.1',
    `Origin: ${WEB}`,
    `Cookie: ${session.cookie}`,
    `x-csrf-token: ${session.view.csrfToken}`,
    `Content-Type: multipart/form-data; boundary=${BOUNDARY}`,
    `Content-Length: ${length}`,
    '',
    '',
  ].join('\r\n');
}
const partHead = `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="clip.mp4"\r\nContent-Type: video/mp4\r\n\r\n`;
async function openUpload(session: Session, length: number) {
  const net = await import('node:net');
  const port = await rawServer();
  const socket = net.connect(port, '127.0.0.1');
  await new Promise<void>((r) => socket.once('connect', () => r()));
  socket.write(uploadHead(session, length) + partHead);
  socket.write(Buffer.concat([MP4, Buffer.alloc(256 * 1024, 7)]));
  return socket;
}
async function responseOf(socket: import('node:net').Socket) {
  return new Promise<string>((resolve) => {
    let text = '';
    socket.on('data', (d) => (text += d.toString('latin1')));
    socket.on('close', () => resolve(text));
    socket.on('error', () => resolve(text));
  });
}
const uploadDirs = async () =>
  (await import('node:fs/promises'))
    .readdir((await import('node:os')).tmpdir())
    .then((names) => names.filter((n) => n.startsWith('vl-upload-')));
const openFds = async () =>
  (await import('node:fs/promises')).readdir('/proc/self/fd').then((l) => l.length);

describe('upload robustness (security review 3.4)', () => {
  it('an upload cut off midway leaves no temporary file, no open file handle and no record', async () => {
    const admin = await as('adminA');
    await rawServer();
    const dirsBefore = await uploadDirs();
    const fdsBefore = await openFds();
    const socket = await openUpload(admin, 50 * 1024 * 1024);
    await new Promise((r) => setTimeout(r, 300));
    socket.destroy();
    await vi.waitFor(async () => expect(await uploadDirs()).toEqual(dirsBefore), { timeout: 5000 });
    await vi.waitFor(async () => expect(await openFds()).toBeLessThanOrEqual(fdsBefore), {
      timeout: 5000,
    });
    expect(await db.asset.count()).toBe(0);
  });

  it('a declared size far over the limit is refused before the body is read, and the connection closed', async () => {
    const admin = await as('adminA');
    const dirsBefore = await uploadDirs();
    const net = await import('node:net');
    const socket = net.connect(await rawServer(), '127.0.0.1');
    await new Promise<void>((r) => socket.once('connect', () => r()));
    const response = responseOf(socket);
    socket.write(uploadHead(admin, 50 * 1024 * 1024, 'image') + partHead);
    const text = await response;
    expect(text).toMatch(/^HTTP\/1\.1 422/);
    expect(text).toMatch(/connection: close/i);
    expect(text).toContain('"too_large"');
    expect(await uploadDirs()).toEqual(dirsBefore);
  });

  it('a body that ends mid-file is refused (422) and the API keeps serving', async () => {
    const admin = await as('adminA');
    const body = Buffer.concat([Buffer.from(partHead), PNG.subarray(0, 20)]);
    const net = await import('node:net');
    const socket = net.connect(await rawServer(), '127.0.0.1');
    await new Promise<void>((r) => socket.once('connect', () => r()));
    let text = '';
    socket.on('data', (d) => (text += d.toString('latin1')));
    socket.write(Buffer.concat([Buffer.from(uploadHead(admin, body.length, 'image')), body]));
    await vi.waitFor(() => expect(text).toMatch(/^HTTP\/1\.1 422/), { timeout: 5000 });
    socket.destroy();
    expect((await request(app.getHttpServer()).get('/health')).status).toBe(200);
    expect(await db.asset.count()).toBe(0);
  });

  it('a third upload while two are in flight is refused (429); the slots free up afterwards', async () => {
    const admin = await as('adminA');
    const first = await openUpload(admin, 50 * 1024 * 1024);
    const second = await openUpload(admin, 50 * 1024 * 1024);
    await new Promise((r) => setTimeout(r, 300));
    const third = await upload('adminA', 'image', PNG, 'cover.png');
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('TOO_MANY_UPLOADS');
    first.destroy();
    second.destroy();
    await vi.waitFor(
      async () => expect((await upload('adminA', 'image', PNG, 'cover.png')).status).toBe(201),
      {
        timeout: 5000,
      },
    );
  });

  it('the download name ends in the detected type, whatever the uploader called the file', async () => {
    const doc = AssetView.parse((await upload('adminA', 'document', PDF, "it's (1).html")).body);
    const link = AssetAccessView.parse(
      (await (await as('adminA')).get(`/api/v1/assets/${doc.id}/access`)).body,
    );
    const disposition = (await fetch(link.url)).headers.get('content-disposition') ?? '';
    expect(disposition).toContain(`filename="it's (1).pdf"`);
    expect(disposition).toContain("filename*=UTF-8''it%27s%20%281%29.pdf");
  });
});

describe('read rule edges (isolation audit 3.4)', () => {
  it("another tenant cannot read tenant A's course cover; its course list never shows it", async () => {
    const asset = await image();
    const c = await course('adminA', 'Lockout tagout');
    expect((await setCover('adminA', c, asset.id)).status).toBe(200);
    for (const person of ['adminB', 'baB1'] as const) {
      for (const path of ['', '/access', '/content']) {
        const res = await (await as(person)).get(`/api/v1/assets/${asset.id}${path}`);
        expect(res.status, `${person} ${path}`).toBe(404);
        expect(res.headers.location).toBeUndefined();
      }
      const list = await (await as(person)).get('/api/v1/courses');
      expect(JSON.stringify(list.body)).not.toContain(asset.id);
    }
  });

  it('removing a cover takes course readers’ access away again; the Tenant Admin keeps it', async () => {
    const asset = await image();
    const c = await course('adminA', 'Lockout tagout');
    const set = CourseAdminView.parse((await setCover('adminA', c, asset.id)).body);
    expect((await (await as('baA1')).get(`/api/v1/assets/${asset.id}/access`)).status).toBe(200);
    expect((await setCover('adminA', set, null)).status).toBe(200);
    expect((await (await as('baA1')).get(`/api/v1/assets/${asset.id}/access`)).status).toBe(404);
    expect((await (await as('adminA')).get(`/api/v1/assets/${asset.id}/access`)).status).toBe(200);
  });

  it('a support session reads covers only: an unattached image or a document is 404', async () => {
    const asset = await image();
    const doc = AssetView.parse((await upload('adminA', 'document', PDF, 'Manual.pdf')).body);
    const staff = await actors.signIn(emailOf('staff'));
    await staff.post('/api/v1/platform/support-sessions', {
      tenantId: f.tenant.A,
      reason: 'Ticket 18: files',
    });
    for (const id of [asset.id, doc.id]) {
      expect((await staff.get(`/api/v1/assets/${id}/access`)).status).toBe(404);
    }
  });

  it('a learner is refused a cover by permission (403), before any lookup', async () => {
    const asset = await image();
    const c = await course('adminA', 'Lockout tagout');
    await setCover('adminA', c, asset.id);
    expect((await (await as('learnerA1')).get(`/api/v1/assets/${asset.id}/access`)).status).toBe(
      403,
    );
  });

  it('a suspended tenant cannot upload or read assets (403 TENANT_SUSPENDED)', async () => {
    const asset = await image();
    await db.tenant.update({
      where: { id: f.tenant.A },
      data: { status: 'suspended', suspendedAt: new Date(), suspendedReason: 'test' },
    });
    const up = await upload('adminA', 'image', PNG, 'x.png');
    expect(up.status).toBe(403);
    expect(up.body.error.code).toBe('TENANT_SUSPENDED');
    expect(
      (await (await as('adminA')).get(`/api/v1/assets/${asset.id}/access`)).body.error.code,
    ).toBe('TENANT_SUSPENDED');
  });

  it('a cover cannot be set when creating a course (strict body)', async () => {
    const asset = await image();
    const res = await (
      await as('adminA')
    ).post('/api/v1/courses', { title: 'With cover', coverAssetId: asset.id });
    expect(res.status).toBe(422);
    expect(await db.course.count()).toBe(0);
  });

  it('a video job whose payload names another tenant fails permanently and changes nothing', async () => {
    const video = AssetView.parse((await upload('adminA', 'video', MP4, 'clip.mp4')).body);
    await db.job.updateMany({
      where: { type: 'asset.video_check' },
      data: { tenantId: f.tenant.B },
    });
    await app.get(JobsService).runDue('test-worker');
    expect((await db.job.findFirstOrThrow({ where: { type: 'asset.video_check' } })).status).toBe(
      'failed',
    );
    expect((await db.asset.findUniqueOrThrow({ where: { id: video.id } })).status).toBe(
      'processing',
    );
  });
});
