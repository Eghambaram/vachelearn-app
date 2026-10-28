import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ApiErrorBody, TenantListPage, TenantView } from '@vachelearn/contracts';
import type { PrismaClient } from '../generated/prisma/client';
import { createTestApp } from './app';
import {
  BRANCH_ADMIN,
  PLATFORM_ADMIN,
  TENANT_ADMIN,
  TEST_ACTOR_HEADER,
  TestActors,
  USER,
} from './actors';
import { resetDatabase, testPrisma } from './db';
import { WEB } from './app';

const actors = new TestActors()
  .set('platform', { userId: USER.platformAdmin, platform: PLATFORM_ADMIN })
  .set('tenant-admin', {
    userId: USER.tenantAdminA,
    tenant: {
      tenantId: '01900000-0000-7000-8000-0000000000ff',
      permissions: TENANT_ADMIN,
      branchScope: 'ALL',
    },
  })
  .set('branch-admin', {
    userId: USER.branchAdminA1,
    tenant: {
      tenantId: '01900000-0000-7000-8000-0000000000ff',
      permissions: BRANCH_ADMIN,
      branchScope: [],
    },
  });

let app: INestApplication;
let db: PrismaClient;

beforeAll(async () => {
  ({ app } = await createTestApp({ contextResolver: actors }));
  db = testPrisma();
});
beforeEach(async () => {
  await resetDatabase(db);
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const as = (actor: string) => ({
  get: (path: string) => request(app.getHttpServer()).get(path).set(TEST_ACTOR_HEADER, actor),
  post: (path: string, body?: object) =>
    request(app.getHttpServer())
      .post(path)
      .set(TEST_ACTOR_HEADER, actor)
      .set('origin', WEB)
      .send(body),
  patch: (path: string, body?: object) =>
    request(app.getHttpServer())
      .patch(path)
      .set(TEST_ACTOR_HEADER, actor)
      .set('origin', WEB)
      .send(body),
});
const platform = as('platform');

async function createTenant(slug = 'demo-manufacturing', extra: object = {}) {
  const res = await platform.post('/api/v1/platform/tenants', {
    slug,
    displayName: 'Demo Manufacturing Co',
    defaultTimezone: 'Asia/Kolkata',
    ...extra,
  });
  expect(res.status).toBe(201);
  return TenantView.parse(res.body);
}

describe('platform tenants: create', () => {
  it('creates an active tenant with defaults, its settings row (flags off, D-031) and a tenant.created audit event', async () => {
    const tenant = await createTenant('demo-manufacturing', {
      defaultLocale: 'en-in',
      industry: 'manufacturing',
      primaryContactEmail: 'ops@example.invalid',
    });
    expect(tenant).toMatchObject({
      slug: 'demo-manufacturing',
      status: 'active',
      defaultLocale: 'en-IN',
      industry: 'manufacturing',
      version: 1,
    });
    const settings = await db.tenantSetting.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    expect(settings).toMatchObject({
      classroomEnabled: false,
      surveysEnabled: false,
      commerceEnabled: false,
      publicCatalogEnabled: false,
      analyticsEnabled: false,
    });
    const events = await db.auditEvent.findMany({ where: { entityId: tenant.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'tenant.created',
      actorUserId: USER.platformAdmin,
      tenantId: tenant.id,
      entityType: 'tenant',
    });
    expect(events[0]!.requestId).toMatch(/^req_/);
  });

  it('duplicate slug → 422 with a field error on slug (spec §4 AC)', async () => {
    await createTenant('demo-logistics');
    const res = await platform.post('/api/v1/platform/tenants', {
      slug: 'demo-logistics',
      displayName: 'Another',
      defaultTimezone: 'Asia/Kolkata',
    });
    expect(res.status).toBe(422);
    expect(ApiErrorBody.parse(res.body).error.fieldErrors).toEqual([
      { field: 'slug', code: 'taken', message: 'This slug is already in use' },
    ]);
  });

  it('invalid slug, unknown time zone and unknown fields (e.g. a status) are 422', async () => {
    const res = await platform.post('/api/v1/platform/tenants', {
      slug: 'Not A Slug',
      displayName: 'X Co',
      defaultTimezone: 'Mars/Olympus',
      status: 'archived',
    });
    expect(res.status).toBe(422);
    const fields = ApiErrorBody.parse(res.body)
      .error.fieldErrors!.map((f) => f.field)
      .sort();
    expect(fields).toEqual(['(root)', 'defaultTimezone', 'slug']);
  });
});

describe('platform tenants: read', () => {
  it('get by id; unknown and malformed ids are the same 404', async () => {
    const tenant = await createTenant();
    expect((await platform.get(`/api/v1/platform/tenants/${tenant.id}`)).body.id).toBe(tenant.id);
    for (const id of ['01900000-0000-7000-8000-00000000dead', 'not-a-uuid']) {
      const res = await platform.get(`/api/v1/platform/tenants/${id}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });

  it('lists with keyset pages that never overlap; a cursor reused with another filter is 422', async () => {
    for (let i = 1; i <= 5; i++) await createTenant(`tenant-${i}`);
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const res = await platform.get(
        `/api/v1/platform/tenants?limit=2&sort=displayName&direction=asc${cursor ? `&cursor=${cursor}` : ''}`,
      );
      expect(res.status).toBe(200);
      const page = TenantListPage.parse(res.body);
      seen.push(...page.data.map((t) => t.slug));
      cursor = page.page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen.sort()).toEqual(['tenant-1', 'tenant-2', 'tenant-3', 'tenant-4', 'tenant-5']);

    const first = TenantListPage.parse(
      (await platform.get('/api/v1/platform/tenants?limit=2')).body,
    );
    const reused = await platform.get(
      `/api/v1/platform/tenants?limit=2&status=active&cursor=${first.page.nextCursor}`,
    );
    expect(reused.status).toBe(422);
    expect(reused.body.error.fieldErrors[0].field).toBe('cursor');
  });

  it('a forged, altered or malformed cursor is 422, never a 500', async () => {
    for (let i = 1; i <= 3; i++) await createTenant(`tenant-${i}`);
    const first = TenantListPage.parse(
      (await platform.get('/api/v1/platform/tenants?limit=1')).body,
    );
    const valid = first.page.nextCursor!;
    const [payload, signature] = valid.split('.');
    const body = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'));
    const forged = Buffer.from(JSON.stringify({ ...body, v: '1970-01-01T00:00:00Z' })).toString(
      'base64url',
    );
    for (const cursor of [
      `${forged}.${signature}`,
      payload!,
      `${payload}.${signature}.x`,
      'not-a-cursor',
      `${Buffer.from('{"v":1}').toString('base64url')}.AAAAAAAAAAAAAAAAAAAAAA`,
    ]) {
      const res = await platform.get(
        `/api/v1/platform/tenants?limit=1&cursor=${encodeURIComponent(cursor)}`,
      );
      expect(res.status, cursor).toBe(422);
      expect(res.body.error.fieldErrors[0].field).toBe('cursor');
    }
  });

  it('filters by status and searches name or slug', async () => {
    await createTenant('alpha-co', { displayName: 'Alpha Fabrication' });
    const beta = await createTenant('beta-co', { displayName: 'Beta Works' });
    await platform.post(`/api/v1/platform/tenants/${beta.id}/suspend`, {
      reason: 'Billing review',
    });
    const suspended = TenantListPage.parse(
      (await platform.get('/api/v1/platform/tenants?status=suspended')).body,
    );
    expect(suspended.data.map((t) => t.slug)).toEqual(['beta-co']);
    const search = TenantListPage.parse(
      (await platform.get('/api/v1/platform/tenants?search=fabric')).body,
    );
    expect(search.data.map((t) => t.slug)).toEqual(['alpha-co']);
  });
});

describe('platform tenants: update (optimistic concurrency)', () => {
  it('renaming keeps the id and the slug (D-079) and audits before/after', async () => {
    const tenant = await createTenant();
    const res = await platform.patch(`/api/v1/platform/tenants/${tenant.id}`, {
      version: 1,
      displayName: 'Demo Manufacturing Ltd',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: tenant.id,
      slug: tenant.slug,
      displayName: 'Demo Manufacturing Ltd',
      version: 2,
    });
    const event = await db.auditEvent.findFirstOrThrow({ where: { action: 'tenant.updated' } });
    expect(event.before).toEqual({ displayName: 'Demo Manufacturing Co' });
    expect(event.after).toEqual({ displayName: 'Demo Manufacturing Ltd' });
  });

  it('a stale version is 409 and nothing changes; the slug cannot be sent', async () => {
    const tenant = await createTenant();
    await platform.patch(`/api/v1/platform/tenants/${tenant.id}`, {
      version: 1,
      displayName: 'First Edit',
    });
    const stale = await platform.patch(`/api/v1/platform/tenants/${tenant.id}`, {
      version: 1,
      displayName: 'Lost Update',
    });
    expect(stale.status).toBe(409);
    expect((await db.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).displayName).toBe(
      'First Edit',
    );
    const slug = await platform.patch(`/api/v1/platform/tenants/${tenant.id}`, {
      version: 2,
      slug: 'renamed',
    });
    expect(slug.status).toBe(422);
  });
});

describe('platform tenants: audit never stores personal values', () => {
  it('a contact email change is audited as changed, never by value (audit rows cannot be erased)', async () => {
    const tenant = await createTenant('demo-co', { primaryContactEmail: 'old@example.test' });
    const res = await platform.patch(`/api/v1/platform/tenants/${tenant.id}`, {
      version: 1,
      primaryContactEmail: 'new@example.test',
    });
    expect(res.status).toBe(200);
    expect(res.body.primaryContactEmail).toBe('new@example.test');
    const events = await db.auditEvent.findMany({ where: { entityId: tenant.id } });
    expect(JSON.stringify(events)).not.toMatch(/@example\.test/);
    const updated = events.find((e) => e.action === 'tenant.updated')!;
    expect(updated.before).toEqual({ primaryContactEmail: '[changed]' });
    expect(updated.after).toEqual({ primaryContactEmail: '[changed]' });
  });
});

describe('platform tenants: lifecycle (audited with actor and reason)', () => {
  it('suspend → reactivate → archive; each records actor, reason and status change', async () => {
    const tenant = await createTenant();
    const suspended = await platform.post(`/api/v1/platform/tenants/${tenant.id}/suspend`, {
      reason: 'Unpaid invoice (demo)',
    });
    expect(suspended.status).toBe(200);
    expect(suspended.body).toMatchObject({
      status: 'suspended',
      suspendedReason: 'Unpaid invoice (demo)',
    });
    expect(suspended.body.suspendedAt).not.toBeNull();

    const reactivated = await platform.post(`/api/v1/platform/tenants/${tenant.id}/reactivate`, {
      reason: 'Paid',
    });
    expect(reactivated.body).toMatchObject({
      status: 'active',
      suspendedAt: null,
      suspendedReason: null,
    });

    const archived = await platform.post(`/api/v1/platform/tenants/${tenant.id}/archive`, {
      reason: 'Contract ended',
    });
    expect(archived.body).toMatchObject({ status: 'archived', archivedReason: 'Contract ended' });

    const events = await db.auditEvent.findMany({
      where: { entityId: tenant.id, action: { not: 'tenant.created' } },
      orderBy: { occurredAt: 'asc' },
    });
    expect(events.map((e) => [e.action, e.actorUserId, e.reason])).toEqual([
      ['tenant.suspended', USER.platformAdmin, 'Unpaid invoice (demo)'],
      ['tenant.reactivated', USER.platformAdmin, 'Paid'],
      ['tenant.archived', USER.platformAdmin, 'Contract ended'],
    ]);
  });

  it('invalid transitions are 409: suspend twice, reactivate an active tenant, anything after archive', async () => {
    const tenant = await createTenant();
    const path = `/api/v1/platform/tenants/${tenant.id}`;
    await platform.post(`${path}/suspend`, { reason: 'First' });
    expect((await platform.post(`${path}/suspend`, { reason: 'Again' })).status).toBe(409);
    await platform.post(`${path}/archive`, { reason: 'Closed' });
    for (const action of ['reactivate', 'suspend', 'archive']) {
      const res = await platform.post(`${path}/${action}`, { reason: 'After archive' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATE');
    }
  });

  it('an archived tenant cannot be edited (409, Proposed D-080) and nothing is audited', async () => {
    const tenant = await createTenant();
    await platform.post(`/api/v1/platform/tenants/${tenant.id}/archive`, { reason: 'Closed' });
    const res = await platform.patch(`/api/v1/platform/tenants/${tenant.id}`, {
      version: 2,
      displayName: 'Too late',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
    expect(await db.auditEvent.count({ where: { action: 'tenant.updated' } })).toBe(0);
  });

  it('a reason is required', async () => {
    const tenant = await createTenant();
    const res = await platform.post(`/api/v1/platform/tenants/${tenant.id}/suspend`, {});
    expect(res.status).toBe(422);
  });
});

describe('platform tenants: who may call', () => {
  it('nobody signed in → 401 (the running app has no sessions until Slice 2.3)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/platform/tenants');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('tenant admins and branch admins cannot reach platform routes (403), whatever they send', async () => {
    const tenant = await createTenant();
    for (const actor of ['tenant-admin', 'branch-admin']) {
      expect((await as(actor).get('/api/v1/platform/tenants')).status).toBe(403);
      expect((await as(actor).get(`/api/v1/platform/tenants/${tenant.id}`)).status).toBe(403);
      expect(
        (await as(actor).post(`/api/v1/platform/tenants/${tenant.id}/suspend`, { reason: 'Try' }))
          .status,
      ).toBe(403);
    }
    expect((await db.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).status).toBe('active');
  });
});
