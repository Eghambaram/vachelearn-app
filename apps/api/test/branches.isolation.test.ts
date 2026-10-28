import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { BranchListPage, BranchView } from '@vachelearn/contracts';
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

/*
 * Branches: functional rules and the isolation rules (.claude/rules/testing.md). Fixture: Tenant A with branches A1, A2;
 * Tenant B with B1. Actors: Tenant Admin of A (all of A), Tenant Admin of B, Branch Admin of A1 (A1 only), and a
 * learner of A without branch permissions.
 */

const actors = new TestActors();
let app: INestApplication;
let db: PrismaClient;
let tenantA: string;
let tenantB: string;
let A1: BranchView;
let A2: BranchView;
let B1: BranchView;

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

async function createBranch(actor: string, code: string, name: string) {
  const res = await as(actor).post('/api/v1/branches', { code, name, timezone: 'Asia/Kolkata' });
  expect(res.status).toBe(201);
  return BranchView.parse(res.body);
}

beforeAll(async () => {
  ({ app } = await createTestApp({ contextResolver: actors }));
  db = testPrisma();
});
beforeEach(async () => {
  await resetDatabase(db);
  tenantA = (
    await db.tenant.create({
      data: { slug: 'tenant-a', displayName: 'Tenant A (Demo)', defaultTimezone: 'Asia/Kolkata' },
    })
  ).id;
  tenantB = (
    await db.tenant.create({
      data: {
        slug: 'tenant-b',
        displayName: 'Tenant B (Demo)',
        defaultTimezone: 'America/Chicago',
      },
    })
  ).id;
  actors
    .set('admin-a', {
      userId: USER.tenantAdminA,
      tenant: { tenantId: tenantA, permissions: TENANT_ADMIN, branchScope: 'ALL' },
    })
    .set('admin-b', {
      userId: USER.tenantAdminB,
      tenant: { tenantId: tenantB, permissions: TENANT_ADMIN, branchScope: 'ALL' },
    });
  A1 = await createBranch('admin-a', 'A1', 'Branch A1');
  A2 = await createBranch('admin-a', 'A2', 'Branch A2');
  B1 = await createBranch('admin-b', 'B1', 'Branch B1');
  actors
    .set('branch-admin-a1', {
      userId: USER.branchAdminA1,
      tenant: { tenantId: tenantA, permissions: BRANCH_ADMIN, branchScope: [A1.id] },
    })
    .set('no-branches-a', {
      userId: USER.branchAdminA1,
      tenant: { tenantId: tenantA, permissions: BRANCH_ADMIN, branchScope: [] },
    })
    .set('scoped-creator-a', {
      userId: USER.branchAdminA1,
      tenant: { tenantId: tenantA, permissions: TENANT_ADMIN, branchScope: [A1.id] },
    })
    .set('platform-only', { userId: USER.platformAdmin, platform: PLATFORM_ADMIN })
    .set('learner-a', {
      userId: USER.learnerA,
      tenant: { tenantId: tenantA, permissions: [], branchScope: [A1.id] },
    });
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe('branches: tenant admin', () => {
  it('creates a branch in its own tenant, code stored uppercase, audited with tenant and branch', async () => {
    const branch = await createBranch('admin-a', 'hq-01', 'Head Office');
    expect(branch).toMatchObject({ code: 'HQ-01', status: 'active', version: 1 });
    const row = await db.branch.findUniqueOrThrow({ where: { id: branch.id } });
    expect(row.tenantId).toBe(tenantA);
    const event = await db.auditEvent.findFirstOrThrow({ where: { entityId: branch.id } });
    expect(event).toMatchObject({
      action: 'branch.created',
      tenantId: tenantA,
      branchId: branch.id,
      actorUserId: USER.tenantAdminA,
    });
  });

  it('branch code is unique within the tenant only (spec §4 AC)', async () => {
    const dup = await as('admin-a').post('/api/v1/branches', {
      code: 'a1',
      name: 'Dup',
      timezone: 'Asia/Kolkata',
    });
    expect(dup.status).toBe(422);
    expect(dup.body.error.fieldErrors).toEqual([
      {
        field: 'code',
        code: 'taken',
        message: 'Another branch in this organisation uses this code',
      },
    ]);
    // The same code in another tenant is fine.
    await createBranch('admin-b', 'A1', 'Tenant B also has an A1');
  });

  it('updates with a version (409 when stale) and deactivates / reactivates with a reason, audited', async () => {
    const renamed = await as('admin-a').patch(`/api/v1/branches/${A1.id}`, {
      version: 1,
      name: 'Plant 1',
    });
    expect(renamed.body).toMatchObject({ name: 'Plant 1', version: 2 });
    expect(
      (await as('admin-a').patch(`/api/v1/branches/${A1.id}`, { version: 1, name: 'Stale' }))
        .status,
    ).toBe(409);

    const off = await as('admin-a').post(`/api/v1/branches/${A1.id}/deactivate`, {
      reason: 'Plant closed (demo)',
    });
    expect(off.body).toMatchObject({
      status: 'inactive',
      deactivatedReason: 'Plant closed (demo)',
    });
    expect(
      (await as('admin-a').post(`/api/v1/branches/${A1.id}/deactivate`, { reason: 'Again' }))
        .status,
    ).toBe(409);
    const on = await as('admin-a').post(`/api/v1/branches/${A1.id}/reactivate`, {
      reason: 'Reopened',
    });
    expect(on.body).toMatchObject({ status: 'active', deactivatedAt: null });
    const actions = (
      await db.auditEvent.findMany({ where: { entityId: A1.id }, orderBy: { occurredAt: 'asc' } })
    ).map((e) => e.action);
    expect(actions).toEqual([
      'branch.created',
      'branch.updated',
      'branch.deactivated',
      'branch.reactivated',
    ]);
  });

  it('lists its tenant’s branches with filters and sort', async () => {
    await as('admin-a').post(`/api/v1/branches/${A2.id}/deactivate`, { reason: 'Closed' });
    const active = BranchListPage.parse(
      (await as('admin-a').get('/api/v1/branches?status=active')).body,
    );
    expect(active.data.map((b) => b.code)).toEqual(['A1']);
    const all = BranchListPage.parse(
      (await as('admin-a').get('/api/v1/branches?sort=code&direction=desc')).body,
    );
    expect(all.data.map((b) => b.code)).toEqual(['A2', 'A1']);
  });
});

describe('branches: isolation (cross-tenant)', () => {
  it('tenant B admin cannot read, update, deactivate or reactivate tenant A’s branch — 404, nothing changes', async () => {
    const b = as('admin-b');
    expect((await b.get(`/api/v1/branches/${A1.id}`)).status).toBe(404);
    expect(
      (await b.patch(`/api/v1/branches/${A1.id}`, { version: 1, name: 'Hijacked' })).status,
    ).toBe(404);
    expect(
      (await b.post(`/api/v1/branches/${A1.id}/deactivate`, { reason: 'Hijack' })).status,
    ).toBe(404);
    expect(
      (await b.post(`/api/v1/branches/${A2.id}/reactivate`, { reason: 'Hijack' })).status,
    ).toBe(404);
    const row = await db.branch.findUniqueOrThrow({ where: { id: A1.id } });
    expect(row).toMatchObject({ name: 'Branch A1', status: 'active', version: 1 });
    expect(
      await db.auditEvent.count({ where: { actorUserId: USER.tenantAdminB, tenantId: tenantA } }),
    ).toBe(0);
  });

  it('tenant B list never contains tenant A rows, with any filter or search', async () => {
    for (const query of ['', '?search=A1', '?search=Branch', '?status=active', '?sort=createdAt']) {
      const page = BranchListPage.parse((await as('admin-b').get(`/api/v1/branches${query}`)).body);
      // Tenant B owns exactly one branch: every row is B1, and A's rows never appear.
      expect(page.data.every((b) => b.id === B1.id)).toBe(true);
      expect(page.data.map((b) => b.id)).not.toContain(A1.id);
      expect(page.data.map((b) => b.id)).not.toContain(A2.id);
    }
  });

  it('a body naming another tenant is rejected (422), and the branch is created in the caller’s tenant only', async () => {
    const res = await as('admin-b').post('/api/v1/branches', {
      code: 'X1',
      name: 'Sneaky',
      timezone: 'Asia/Kolkata',
      tenantId: tenantA,
    });
    expect(res.status).toBe(422);
    expect(await db.branch.count({ where: { code: 'X1' } })).toBe(0);
  });

  it('a cursor from tenant A’s list is refused in tenant B (422)', async () => {
    const page = BranchListPage.parse((await as('admin-a').get('/api/v1/branches?limit=1')).body);
    const res = await as('admin-b').get(`/api/v1/branches?limit=1&cursor=${page.page.nextCursor}`);
    expect(res.status).toBe(422);
  });
});

describe('branches: isolation (cross-branch)', () => {
  it('branch admin of A1 reads A1 but gets 404 for A2', async () => {
    expect((await as('branch-admin-a1').get(`/api/v1/branches/${A1.id}`)).status).toBe(200);
    expect((await as('branch-admin-a1').get(`/api/v1/branches/${A2.id}`)).status).toBe(404);
  });

  it('branch admin of A1 lists only A1, whatever the filter or search', async () => {
    for (const query of [
      '',
      '?search=A2',
      '?search=Branch',
      '?status=active',
      '?sort=code&direction=desc',
    ]) {
      const page = BranchListPage.parse(
        (await as('branch-admin-a1').get(`/api/v1/branches${query}`)).body,
      );
      expect(page.data.map((b) => b.id).filter((id) => id !== A1.id)).toEqual([]);
    }
  });

  it('a cursor crafted from the tenant admin’s list cannot widen the branch admin’s view (422)', async () => {
    const page = BranchListPage.parse((await as('admin-a').get('/api/v1/branches?limit=1')).body);
    const res = await as('branch-admin-a1').get(
      `/api/v1/branches?limit=1&cursor=${page.page.nextCursor}`,
    );
    expect(res.status).toBe(422);
  });

  it('branch admin cannot create, update or deactivate branches (403, matrix: branch.* is tenant admin only)', async () => {
    const ba = as('branch-admin-a1');
    expect(
      (await ba.post('/api/v1/branches', { code: 'A9', name: 'New', timezone: 'Asia/Kolkata' }))
        .status,
    ).toBe(403);
    expect(
      (await ba.patch(`/api/v1/branches/${A1.id}`, { version: 1, name: 'Renamed' })).status,
    ).toBe(403);
    expect((await ba.post(`/api/v1/branches/${A1.id}/deactivate`, { reason: 'No' })).status).toBe(
      403,
    );
  });

  it('a branch-scoped actor with no branches sees nothing: empty list, every id 404', async () => {
    const page = BranchListPage.parse((await as('no-branches-a').get('/api/v1/branches')).body);
    expect(page.data).toEqual([]);
    for (const b of [A1, A2, B1]) {
      expect((await as('no-branches-a').get(`/api/v1/branches/${b.id}`)).status).toBe(404);
    }
  });

  it('a branch-scoped actor cannot create a branch even when holding branch.create (403); it can edit only its own', async () => {
    const res = await as('scoped-creator-a').post('/api/v1/branches', {
      code: 'A9',
      name: 'New',
      timezone: 'Asia/Kolkata',
    });
    expect(res.status).toBe(403);
    expect(await db.branch.count({ where: { code: 'A9' } })).toBe(0);
    expect(
      (
        await as('scoped-creator-a').patch(`/api/v1/branches/${A2.id}`, {
          version: 1,
          name: 'Renamed A2',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await as('scoped-creator-a').post(`/api/v1/branches/${A2.id}/deactivate`, {
          reason: 'Out of scope',
        })
      ).status,
    ).toBe(404);
    expect((await db.branch.findUniqueOrThrow({ where: { id: A2.id } })).name).toBe('Branch A2');
    expect(
      (await as('scoped-creator-a').patch(`/api/v1/branches/${A1.id}`, { version: 1, name: 'A1+' }))
        .status,
    ).toBe(200);
  });

  it('a forged or altered cursor is 422', async () => {
    const page = BranchListPage.parse((await as('admin-a').get('/api/v1/branches?limit=1')).body);
    const [payload, signature] = page.page.nextCursor!.split('.');
    const body = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'));
    const widened = Buffer.from(JSON.stringify({ ...body, v: '' })).toString('base64url');
    for (const cursor of [`${widened}.${signature}`, 'garbage', `${payload}.`]) {
      const res = await as('admin-a').get(
        `/api/v1/branches?limit=1&cursor=${encodeURIComponent(cursor)}`,
      );
      expect(res.status, cursor).toBe(422);
    }
  });

  it('platform staff without a tenant membership cannot reach tenant routes (403)', async () => {
    expect((await as('platform-only').get('/api/v1/branches')).status).toBe(403);
    expect((await as('platform-only').get(`/api/v1/branches/${A1.id}`)).status).toBe(403);
  });

  it('a learner (no branch permissions) gets 403; nobody signed in gets 401', async () => {
    expect((await as('learner-a').get('/api/v1/branches')).status).toBe(403);
    expect((await request(app.getHttpServer()).get('/api/v1/branches')).status).toBe(401);
  });
});
