import type { INestApplication } from '@nestjs/common';
import {
  AuthSessionView,
  BranchListPage,
  CSRF_HEADER,
  MembershipList,
} from '@vachelearn/contracts';
import request from 'supertest';
import type { PrismaClient } from '../generated/prisma/client';
import { MembershipsService } from '../src/access/memberships.service';
import type { TenantRole } from '../src/access/permissions';
import { hashPassword } from '../src/auth/passwords';
import { createTestApp, WEB } from './app';
import { resetDatabase, testPrisma } from './db';

/*
 * The real request context (Slice 2.4a; D-026, D-037, D-053, D-089), end to end through the session resolver — no test
 * callers: real sign-in, memberships and role assignments, and what each session can reach. Fixture: tenants A
 * (branches A1, A2) and B (B1).
 */

const PASSWORD = 'correct horse battery staple';
let app: INestApplication;
let db: PrismaClient;
let passwordHash: string;
let tenantA: string;
let tenantB: string;
let A1: string;
let A2: string;
let B1: string;

beforeAll(async () => {
  ({ app } = await createTestApp());
  db = testPrisma();
  passwordHash = await hashPassword(PASSWORD);
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
  const branch = async (tenantId: string, code: string) =>
    (
      await db.branch.create({
        data: { tenantId, code, name: `Branch ${code}`, timezone: 'Asia/Kolkata' },
      })
    ).id;
  A1 = await branch(tenantA, 'A1');
  A2 = await branch(tenantA, 'A2');
  B1 = await branch(tenantB, 'B1');
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const memberships = () => app.get(MembershipsService);
const OPERATOR = { userId: null, requestId: null, reason: 'test' };

async function user(email: string) {
  return (
    await db.user.create({
      data: {
        email,
        displayName: `${email} (Demo)`,
        emailVerifiedAt: new Date(),
        credential: { create: { passwordHash, changedAt: new Date() } },
      },
    })
  ).id;
}

const grant = (
  userId: string,
  tenantId: string,
  role: TenantRole,
  branchId: string | null = null,
) => memberships().operatorGrantTenantRole({ userId, tenantId, role, branchId }, OPERATOR);

async function signIn(email: string) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('origin', WEB)
    .send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  const cookie = String(res.headers['set-cookie']).split(';')[0]!;
  const view = AuthSessionView.parse(res.body);
  const as = {
    get: (path: string) => request(app.getHttpServer()).get(path).set('cookie', cookie),
    post: (path: string, body?: object) =>
      request(app.getHttpServer())
        .post(path)
        .set('origin', WEB)
        .set('cookie', cookie)
        .set(CSRF_HEADER, view.csrfToken)
        .send(body),
    async switchTo(membershipId: string) {
      return as.post('/api/v1/auth/session/tenant', { membershipId });
    },
  };
  return { ...as, view, cookie };
}

const branchIds = async (res: request.Response) =>
  BranchListPage.parse(res.body)
    .data.map((b) => b.id)
    .sort();

describe('active tenant (D-089)', () => {
  it('one membership: the session starts in it', async () => {
    const id = await user('admin-a@example.test');
    const { membershipId } = await grant(id, tenantA, 'tenant_admin');
    const s = await signIn('admin-a@example.test');
    expect(s.view.activeTenant).toMatchObject({
      membershipId,
      tenantId: tenantA,
      slug: 'tenant-a',
    });
    expect(await branchIds(await s.get('/api/v1/branches'))).toEqual([A1, A2].sort());
  });

  it('a user with roles in two tenants sees only the active tenant’s data, and switches explicitly', async () => {
    const id = await user('both@example.test');
    const a = await grant(id, tenantA, 'tenant_admin');
    const b = await grant(id, tenantB, 'tenant_admin');
    const s = await signIn('both@example.test');
    // Two memberships: nothing is active until the user chooses.
    expect(s.view.activeTenant).toBeNull();
    expect((await s.get('/api/v1/branches')).status).toBe(403);

    const list = MembershipList.parse((await s.get('/api/v1/me/memberships')).body);
    expect(list.data.map((m) => m.tenant.slug)).toEqual(['tenant-a', 'tenant-b']);

    const toA = await s.switchTo(a.membershipId);
    expect(toA.status).toBe(200);
    expect(AuthSessionView.parse(toA.body).activeTenant?.tenantId).toBe(tenantA);
    expect(await branchIds(await s.get('/api/v1/branches'))).toEqual([A1, A2].sort());
    expect((await s.get(`/api/v1/branches/${B1}`)).status).toBe(404);

    await s.switchTo(b.membershipId);
    expect(await branchIds(await s.get('/api/v1/branches'))).toEqual([B1]);
    expect((await s.get(`/api/v1/branches/${A1}`)).status).toBe(404);
    expect(
      await db.auditEvent.count({ where: { action: 'auth.tenant_switched', actorUserId: id } }),
    ).toBe(2);
  });

  it('cannot switch to someone else’s membership or an unknown one (same 404)', async () => {
    const mine = await user('mine@example.test');
    const other = await user('other@example.test');
    await grant(mine, tenantA, 'learner');
    const theirs = await grant(other, tenantB, 'tenant_admin');
    const s = await signIn('mine@example.test');
    for (const membershipId of [theirs.membershipId, '01900000-0000-7000-8000-00000000dead']) {
      const res = await s.switchTo(membershipId);
      expect(res.status).toBe(404);
    }
    const session = await db.authSession.findFirstOrThrow({ where: { userId: mine } });
    expect(session.activeMembershipId).not.toBe(theirs.membershipId);
  });

  it('the database refuses a session pointing at another user’s membership', async () => {
    const mine = await user('mine@example.test');
    const other = await user('other@example.test');
    const theirs = await grant(other, tenantB, 'tenant_admin');
    await grant(mine, tenantA, 'learner');
    await signIn('mine@example.test');
    await expect(
      db.authSession.updateMany({
        where: { userId: mine },
        data: { activeMembershipId: theirs.membershipId },
      }),
    ).rejects.toThrow();
  });
});

describe('changes take effect on the next request (D-049)', () => {
  it('a suspended tenant: tenant routes answer 403 TENANT_SUSPENDED; switching into it is refused', async () => {
    const id = await user('admin@example.test');
    const a = await grant(id, tenantA, 'tenant_admin');
    const b = await grant(id, tenantB, 'tenant_admin');
    const s = await signIn('admin@example.test');
    await s.switchTo(a.membershipId);
    await db.tenant.update({
      where: { id: tenantA },
      data: { status: 'suspended', suspendedAt: new Date(), suspendedReason: 'test' },
    });
    const res = await s.get('/api/v1/branches');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TENANT_SUSPENDED');
    // The account itself still works: the user can see where they are and leave.
    expect((await s.get('/api/v1/auth/me')).status).toBe(200);
    expect((await s.switchTo(b.membershipId)).status).toBe(200);
    expect((await s.switchTo(a.membershipId)).body.error.code).toBe('TENANT_SUSPENDED');
  });

  it('a revoked role or a deactivated membership removes access at once', async () => {
    const id = await user('admin@example.test');
    const { membershipId, assignmentId } = await grant(id, tenantA, 'tenant_admin');
    const s = await signIn('admin@example.test');
    expect((await s.get('/api/v1/branches')).status).toBe(200);

    await db.roleAssignment.update({
      where: { id: assignmentId },
      data: { revokedAt: new Date(), revokedReason: 'test' },
    });
    expect((await s.get('/api/v1/branches')).status).toBe(403);

    await grant(id, tenantA, 'tenant_admin');
    expect((await s.get('/api/v1/branches')).status).toBe(200);
    await db.membership.update({
      where: { id: membershipId },
      data: { status: 'deactivated', deactivatedAt: new Date(), deactivatedReason: 'test' },
    });
    expect((await s.get('/api/v1/branches')).status).toBe(403);
    expect(MembershipList.parse((await s.get('/api/v1/me/memberships')).body).data).toEqual([]);
  });
});

describe('branch scope comes from the role assignments', () => {
  it('a Branch Admin of A1 lists and reads A1 only, and cannot create branches', async () => {
    const id = await user('ba@example.test');
    await grant(id, tenantA, 'branch_admin', A1);
    const s = await signIn('ba@example.test');
    expect(await branchIds(await s.get('/api/v1/branches'))).toEqual([A1]);
    expect((await s.get(`/api/v1/branches/${A2}`)).status).toBe(404);
    expect(
      (await s.post('/api/v1/branches', { code: 'A9', name: 'New', timezone: 'Asia/Kolkata' }))
        .status,
    ).toBe(403);
  });

  it('roles add up per permission: a tenant-wide Learner who is Branch Admin of A1 reaches A1 only', async () => {
    const id = await user('mixed@example.test');
    await grant(id, tenantA, 'learner');
    await grant(id, tenantA, 'branch_admin', A1);
    const s = await signIn('mixed@example.test');
    expect(await branchIds(await s.get('/api/v1/branches'))).toEqual([A1]);
  });

  it('a Learner alone has no branch permission at all', async () => {
    const id = await user('learner@example.test');
    await grant(id, tenantA, 'learner');
    const s = await signIn('learner@example.test');
    expect((await s.get('/api/v1/branches')).status).toBe(403);
  });
});

describe('platform roles (D-037: no implicit tenant access)', () => {
  it('a platform admin reaches platform routes, and no tenant data', async () => {
    const id = await user('psa@example.test');
    await memberships().operatorGrantPlatformRole(
      { userId: id, role: 'platform_super_admin' },
      OPERATOR,
    );
    const s = await signIn('psa@example.test');
    expect((await s.get('/api/v1/platform/tenants')).status).toBe(200);
    expect((await s.get('/api/v1/branches')).status).toBe(403);
    expect((await s.get(`/api/v1/branches/${A1}`)).status).toBe(403);
  });

  it('tenant roles never reach platform routes', async () => {
    const id = await user('admin@example.test');
    await grant(id, tenantA, 'tenant_admin');
    const s = await signIn('admin@example.test');
    expect((await s.get('/api/v1/platform/tenants')).status).toBe(403);
  });
});

describe('database rules for memberships and roles', () => {
  it('a Branch Admin needs a branch; one live copy of a role per scope; grants are idempotent and audited', async () => {
    const id = await user('x@example.test');
    await expect(grant(id, tenantA, 'branch_admin', null)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    const first = await grant(id, tenantA, 'learner');
    const again = await grant(id, tenantA, 'learner');
    expect(again).toMatchObject({ created: false, assignmentId: first.assignmentId });
    await expect(
      db.roleAssignment.create({
        data: { tenantId: tenantA, membershipId: first.membershipId, role: 'learner' },
      }),
    ).rejects.toThrow();
    await expect(
      db.roleAssignment.create({
        data: { tenantId: tenantA, membershipId: first.membershipId, role: 'branch_admin' },
      }),
    ).rejects.toThrow('role_assignments_branch_admin_has_branch');
    expect(await db.auditEvent.count({ where: { action: 'role.assigned' } })).toBe(1);
    expect(await db.auditEvent.count({ where: { action: 'membership.created' } })).toBe(1);
  });

  it('cross-tenant links are impossible: a role on another tenant’s branch, a primary branch outside the member’s', async () => {
    const id = await user('x@example.test');
    const { membershipId } = await grant(id, tenantA, 'learner');
    await expect(
      db.roleAssignment.create({
        data: { tenantId: tenantA, membershipId, role: 'branch_admin', branchId: B1 },
      }),
    ).rejects.toThrow();
    await expect(
      db.membership.update({ where: { id: membershipId }, data: { primaryBranchId: A2 } }),
    ).rejects.toThrow('memberships_primary_is_member');
    await grant(id, tenantA, 'branch_admin', A1);
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: membershipId } })).primaryBranchId,
    ).toBe(A1);
    // A1 carries a role: removing it is refused by the role's foreign key.
    await expect(
      db.membershipBranch.delete({
        where: { membershipId_branchId: { membershipId, branchId: A1 } },
      }),
    ).rejects.toThrow();
    // A2 carries no role but is the primary branch: the deferred trigger refuses removing it.
    await db.membershipBranch.create({ data: { tenantId: tenantA, membershipId, branchId: A2 } });
    await db.membership.update({ where: { id: membershipId }, data: { primaryBranchId: A2 } });
    await expect(
      db.membershipBranch.delete({
        where: { membershipId_branchId: { membershipId, branchId: A2 } },
      }),
    ).rejects.toThrow('memberships_primary_is_member');
  });
});

describe('tenant-isolation audit 2.4a fixes', () => {
  it('a Tenant Admin is whole-tenant only: refused on a branch by the service and the database', async () => {
    const id = await user('x@example.test');
    await expect(grant(id, tenantA, 'tenant_admin', A1)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    const { membershipId } = await grant(id, tenantA, 'branch_admin', A1);
    await expect(
      db.roleAssignment.create({
        data: { tenantId: tenantA, membershipId, role: 'tenant_admin', branchId: A1 },
      }),
    ).rejects.toThrow('role_assignments_tenant_admin_whole_tenant');
  });

  it('a branch role must sit on one of the member’s branches, and that branch cannot be removed under it', async () => {
    const id = await user('x@example.test');
    const { membershipId } = await grant(id, tenantA, 'branch_admin', A1);
    await expect(
      db.roleAssignment.create({
        data: { tenantId: tenantA, membershipId, role: 'learning_manager', branchId: A2 },
      }),
    ).rejects.toThrow();
    await db.membership.update({ where: { id: membershipId }, data: { primaryBranchId: null } });
    await expect(
      db.membershipBranch.delete({
        where: { membershipId_branchId: { membershipId, branchId: A1 } },
      }),
    ).rejects.toThrow();
    await expect(
      db.membershipBranch.updateMany({ where: { membershipId }, data: { branchId: A2 } }),
    ).rejects.toThrow('insert/delete only');
  });

  it('a role on a deactivated branch grants nothing (D-090, Proposed)', async () => {
    const id = await user('ba@example.test');
    await grant(id, tenantA, 'branch_admin', A1);
    const s = await signIn('ba@example.test');
    expect((await s.get('/api/v1/branches')).status).toBe(200);
    await db.branch.update({
      where: { id: A1 },
      data: { status: 'inactive', deactivatedAt: new Date(), deactivatedReason: 'test' },
    });
    expect((await s.get('/api/v1/branches')).status).toBe(403);
  });

  it('an archived tenant: tenant routes answer 403 TENANT_ARCHIVED', async () => {
    const id = await user('admin@example.test');
    await grant(id, tenantA, 'tenant_admin');
    const s = await signIn('admin@example.test');
    await db.tenant.update({
      where: { id: tenantA },
      data: { status: 'archived', archivedAt: new Date(), archivedReason: 'test' },
    });
    expect((await s.get('/api/v1/branches')).body.error.code).toBe('TENANT_ARCHIVED');
  });

  it('a revoked platform role loses platform routes on the next request', async () => {
    const id = await user('psa@example.test');
    const { assignmentId } = await memberships().operatorGrantPlatformRole(
      { userId: id, role: 'platform_super_admin' },
      OPERATOR,
    );
    const s = await signIn('psa@example.test');
    expect((await s.get('/api/v1/platform/tenants')).status).toBe(200);
    await db.platformRoleAssignment.update({
      where: { id: assignmentId },
      data: { revokedAt: new Date(), revokedReason: 'test' },
    });
    expect((await s.get('/api/v1/platform/tenants')).status).toBe(403);
  });

  it('switching needs the session’s CSRF token, and records the previous membership', async () => {
    const id = await user('both@example.test');
    const a = await grant(id, tenantA, 'tenant_admin');
    const b = await grant(id, tenantB, 'tenant_admin');
    const s = await signIn('both@example.test');
    const noCsrf = await request(app.getHttpServer())
      .post('/api/v1/auth/session/tenant')
      .set('origin', WEB)
      .set('cookie', s.cookie)
      .send({ membershipId: a.membershipId });
    expect(noCsrf.status).toBe(403);
    await s.switchTo(a.membershipId);
    await s.switchTo(b.membershipId);
    const last = await db.auditEvent.findFirstOrThrow({
      where: { action: 'auth.tenant_switched' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(last.before).toEqual({ membershipId: a.membershipId });
    expect(last.after).toEqual({ membershipId: b.membershipId });
  });

  it('once only one usable membership is left, the session selects it (audited)', async () => {
    const id = await user('both@example.test');
    const a = await grant(id, tenantA, 'tenant_admin');
    const b = await grant(id, tenantB, 'tenant_admin');
    const s = await signIn('both@example.test');
    expect(s.view.activeTenant).toBeNull();
    await db.membership.update({
      where: { id: b.membershipId },
      data: { status: 'deactivated', deactivatedAt: new Date(), deactivatedReason: 'test' },
    });
    expect(await branchIds(await s.get('/api/v1/branches'))).toEqual([A1, A2].sort());
    expect(
      await db.auditEvent.count({
        where: { action: 'auth.tenant_selected', entityId: a.membershipId },
      }),
    ).toBe(1);
  });

  it('roles are granted only to active accounts, in tenants that are not archived, on active branches', async () => {
    const id = await user('gone@example.test');
    await db.user.update({
      where: { id },
      data: { status: 'deactivated', deactivatedAt: new Date() },
    });
    await expect(grant(id, tenantA, 'learner')).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const ok = await user('ok@example.test');
    await db.branch.update({
      where: { id: A2 },
      data: { status: 'inactive', deactivatedAt: new Date(), deactivatedReason: 'test' },
    });
    await expect(grant(ok, tenantA, 'branch_admin', A2)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(grant(ok, tenantA, 'branch_admin', B1)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
