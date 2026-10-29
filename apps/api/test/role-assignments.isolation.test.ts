import type { INestApplication } from '@nestjs/common';
import { FirstAdminResult, RoleAssignmentList, RoleAssignmentView } from '@vachelearn/contracts';
import type { PrismaClient } from '../generated/prisma/client';
import { RoleAssignmentsService } from '../src/access/role-assignments.service';
import { hashPassword } from '../src/auth/passwords';
import { createTestApp } from './app';
import { resetDatabase, testPrisma } from './db';
import { realActors, TEST_PASSWORD } from './sessions';

/*
 * Role assignment (Slice 2.4b; matrix "Granting rules"; D-091–D-094) through real sessions. Fixture: tenant A (A1, A2)
 * with a Tenant Admin, a Branch Admin of A1 and members; tenant B (B1) with its own admin and member.
 */

let app: INestApplication;
let db: PrismaClient;
let actors: ReturnType<typeof realActors>;
let tenantA: string;
let tenantB: string;
let A1: string;
let A2: string;
let B1: string;
const m: Record<string, string> = {};

beforeAll(async () => {
  ({ app } = await createTestApp());
  db = testPrisma();
  actors = realActors(app, db, await hashPassword(TEST_PASSWORD));
});
beforeEach(async () => {
  await resetDatabase(db);
  const tenant = async (slug: string) =>
    (
      await db.tenant.create({
        data: { slug, displayName: `${slug} (Demo)`, defaultTimezone: 'Asia/Kolkata' },
      })
    ).id;
  tenantA = await tenant('tenant-a');
  tenantB = await tenant('tenant-b');
  const branch = async (tenantId: string, code: string) =>
    (
      await db.branch.create({
        data: { tenantId, code, name: `Branch ${code}`, timezone: 'Asia/Kolkata' },
      })
    ).id;
  A1 = await branch(tenantA, 'A1');
  A2 = await branch(tenantA, 'A2');
  B1 = await branch(tenantB, 'B1');
  const { user, grant } = actors;
  m.adminA = (
    await grant(await user('admin-a@example.test'), tenantA, 'tenant_admin')
  ).membershipId;
  m.baA1 = (
    await grant(await user('ba-a1@example.test'), tenantA, 'branch_admin', A1)
  ).membershipId;
  m.memberA1 = (
    await grant(await user('member-a1@example.test'), tenantA, 'learner', A1)
  ).membershipId;
  m.memberA2 = (
    await grant(await user('member-a2@example.test'), tenantA, 'learner', A2)
  ).membershipId;
  m.memberA = (await grant(await user('member-a@example.test'), tenantA, 'learner')).membershipId;
  m.adminB = (
    await grant(await user('admin-b@example.test'), tenantB, 'tenant_admin')
  ).membershipId;
  m.memberB1 = (
    await grant(await user('member-b1@example.test'), tenantB, 'learner', B1)
  ).membershipId;
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const assign = (s: Awaited<ReturnType<typeof actors.signIn>>, body: object) =>
  s.post('/api/v1/role-assignments', body);

describe('Tenant Admin', () => {
  it('assigns any role tenant-wide or on a branch, lists and revokes it (audited)', async () => {
    const s = await actors.signIn('admin-a@example.test');
    const created = await assign(s, {
      membershipId: m.memberA1,
      role: 'learning_manager',
      branchId: A1,
    });
    expect(created.status).toBe(201);
    const view = RoleAssignmentView.parse(created.body);
    expect(view).toMatchObject({ role: 'learning_manager', branch: { id: A1, code: 'A1' } });

    const list = RoleAssignmentList.parse(
      (await s.get(`/api/v1/role-assignments?membershipId=${m.memberA1}`)).body,
    );
    expect(list.data.map((a) => a.role).sort()).toEqual(['learner', 'learning_manager']);

    const revoked = await s.post(`/api/v1/role-assignments/${view.id}/revoke`, {
      reason: 'Moved team',
    });
    expect(revoked.status).toBe(200);
    const events = await db.auditEvent.findMany({
      where: { entityId: view.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(events.map((e) => e.action)).toEqual(['role.assigned', 'role.revoked']);
    expect(events[1]!.reason).toBe('Moved team');
  });

  it('adds the branch membership when the member is not in the branch yet (D-093), audited', async () => {
    const s = await actors.signIn('admin-a@example.test');
    const res = await assign(s, { membershipId: m.memberA, role: 'instructor', branchId: A2 });
    expect(res.status).toBe(201);
    expect(
      await db.membershipBranch.count({ where: { membershipId: m.memberA, branchId: A2 } }),
    ).toBe(1);
    expect(
      await db.auditEvent.count({
        where: { action: 'membership.branch_added', entityId: m.memberA },
      }),
    ).toBe(1);
  });

  it('manages other Tenant Admins (D-094), never its own roles', async () => {
    const s = await actors.signIn('admin-a@example.test');
    const second = RoleAssignmentView.parse(
      (await assign(s, { membershipId: m.memberA, role: 'tenant_admin', branchId: null })).body,
    );
    expect(
      (await s.post(`/api/v1/role-assignments/${second.id}/revoke`, { reason: 'Temporary only' }))
        .status,
    ).toBe(200);

    const own = await db.roleAssignment.findFirstOrThrow({
      where: { membershipId: m.adminA, revokedAt: null },
    });
    const self = await s.post(`/api/v1/role-assignments/${own.id}/revoke`, { reason: 'Leaving' });
    expect(self.status).toBe(403);
    expect(self.body.error.code).toBe('SELF_CHANGE');
    const selfAssign = await assign(s, { membershipId: m.adminA, role: 'learner', branchId: null });
    expect(selfAssign.body.error.code).toBe('SELF_CHANGE');
  });

  it('never revokes the last Tenant Admin (D-091): two admins revoking each other at once leave one', async () => {
    const otherId = await actors.user('other-admin@example.test');
    const other = await actors.grant(otherId, tenantA, 'tenant_admin');
    const first = await db.roleAssignment.findFirstOrThrow({
      where: { membershipId: m.adminA, role: 'tenant_admin', revokedAt: null },
    });
    // Both requests passed the access check at the same moment; the first revocation commits…
    const o = await actors.signIn('other-admin@example.test');
    expect(
      (await o.post(`/api/v1/role-assignments/${first.id}/revoke`, { reason: 'Handover' })).status,
    ).toBe(200);
    // …and the second (by the admin just revoked, still inside its request) finds no other admin left.
    const service = app.get(RoleAssignmentsService);
    const ctx = {
      requestId: 'req_race',
      userId: (await db.membership.findUniqueOrThrow({ where: { id: m.adminA } })).userId,
      platform: null,
      tenant: {
        tenantId: tenantA,
        permissions: new Set(['role.assign'] as const),
        branchScope: 'ALL' as const,
      },
    };
    // A real session carries its membership: re-read under the lock, the revoked actor has no role.assign any more.
    await expect(
      service.revoke(
        { ...ctx, tenant: { ...ctx.tenant, membershipId: m.adminA } },
        other.assignmentId,
        'Handover',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // Even without that re-check, the last-admin rule holds.
    await expect(service.revoke(ctx, other.assignmentId, 'Handover')).rejects.toMatchObject({
      code: 'LAST_TENANT_ADMIN',
    });
    expect(
      await db.roleAssignment.count({
        where: { tenantId: tenantA, role: 'tenant_admin', revokedAt: null },
      }),
    ).toBe(1);
  });

  it('refuses a Tenant Admin on a branch, a Branch Admin without one, a duplicate, an inactive branch', async () => {
    const s = await actors.signIn('admin-a@example.test');
    expect(
      (await assign(s, { membershipId: m.memberA, role: 'tenant_admin', branchId: A1 })).status,
    ).toBe(422);
    expect(
      (await assign(s, { membershipId: m.memberA, role: 'branch_admin', branchId: null })).status,
    ).toBe(422);
    const dup = await assign(s, { membershipId: m.memberA1, role: 'learner', branchId: A1 });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ALREADY_ASSIGNED');
    await db.branch.update({
      where: { id: A2 },
      data: { status: 'inactive', deactivatedAt: new Date(), deactivatedReason: 'closed' },
    });
    expect(
      (await assign(s, { membershipId: m.memberA, role: 'learner', branchId: A2 })).status,
    ).toBe(404);
  });
});

describe('Branch Admin (B (LRN, INS only))', () => {
  it('assigns Learner or Instructor on its own branch to members already in it', async () => {
    const s = await actors.signIn('ba-a1@example.test');
    const res = await assign(s, { membershipId: m.memberA1, role: 'instructor', branchId: A1 });
    expect(res.status).toBe(201);
    const id = RoleAssignmentView.parse(res.body).id;
    expect(
      (await s.post(`/api/v1/role-assignments/${id}/revoke`, { reason: 'Rota change' })).status,
    ).toBe(200);
  });

  it('cannot assign other roles, tenant-wide roles, or on another branch', async () => {
    const s = await actors.signIn('ba-a1@example.test');
    for (const role of ['branch_admin', 'learning_manager', 'compliance_viewer', 'tenant_admin']) {
      const res = await assign(s, {
        membershipId: m.memberA1,
        role,
        branchId: role === 'tenant_admin' ? null : A1,
      });
      expect([403, 422]).toContain(res.status);
    }
    expect(
      (await assign(s, { membershipId: m.memberA1, role: 'learner', branchId: null })).status,
    ).toBe(422);
    expect(
      (await assign(s, { membershipId: m.memberA1, role: 'learner', branchId: A2 })).status,
    ).toBe(404);
    expect(await db.roleAssignment.count({ where: { createdById: { not: null } } })).toBe(0);
  });

  it('cannot reach members outside its branches, nor pull them in (D-093)', async () => {
    const s = await actors.signIn('ba-a1@example.test');
    expect(
      (await assign(s, { membershipId: m.memberA2, role: 'learner', branchId: A1 })).status,
    ).toBe(404);
    expect((await s.get(`/api/v1/role-assignments?membershipId=${m.memberA2}`)).status).toBe(404);
    // A tenant-wide member not in A1 is invisible to the Branch Admin too.
    expect(
      (await assign(s, { membershipId: m.memberA, role: 'learner', branchId: A1 })).status,
    ).toBe(404);
  });

  it('sees only assignments on its branches, and cannot revoke what it cannot assign', async () => {
    const admin = await actors.signIn('admin-a@example.test');
    const lm = RoleAssignmentView.parse(
      (await assign(admin, { membershipId: m.memberA1, role: 'learning_manager', branchId: A1 }))
        .body,
    );
    const tenantWide = RoleAssignmentView.parse(
      (await assign(admin, { membershipId: m.memberA1, role: 'compliance_viewer', branchId: null }))
        .body,
    );
    const s = await actors.signIn('ba-a1@example.test');
    const list = RoleAssignmentList.parse(
      (await s.get(`/api/v1/role-assignments?membershipId=${m.memberA1}`)).body,
    );
    expect(list.data.map((a) => a.role).sort()).toEqual(['learner', 'learning_manager']);
    expect(
      (await s.post(`/api/v1/role-assignments/${lm.id}/revoke`, { reason: 'Try it' })).status,
    ).toBe(403);
    expect(
      (await s.post(`/api/v1/role-assignments/${tenantWide.id}/revoke`, { reason: 'Try it' }))
        .status,
    ).toBe(404);
  });
});

describe('isolation', () => {
  it('another tenant’s membership, branch or assignment is 404, and nothing is created', async () => {
    const s = await actors.signIn('admin-a@example.test');
    expect(
      (await assign(s, { membershipId: m.memberB1, role: 'learner', branchId: null })).status,
    ).toBe(404);
    expect(
      (await assign(s, { membershipId: m.memberA, role: 'learner', branchId: B1 })).status,
    ).toBe(404);
    expect((await s.get(`/api/v1/role-assignments?membershipId=${m.memberB1}`)).status).toBe(404);
    const bAssignment = await db.roleAssignment.findFirstOrThrow({
      where: { membershipId: m.memberB1 },
    });
    expect(
      (await s.post(`/api/v1/role-assignments/${bAssignment.id}/revoke`, { reason: 'Cross' }))
        .status,
    ).toBe(404);
    expect(
      await db.roleAssignment.count({ where: { tenantId: tenantB, revokedAt: { not: null } } }),
    ).toBe(0);
    expect(await db.roleAssignment.count({ where: { createdById: { not: null } } })).toBe(0);
  });

  it('a body naming a tenant is refused; a learner without role.assign gets 403', async () => {
    const s = await actors.signIn('admin-a@example.test');
    expect(
      (
        await assign(s, {
          membershipId: m.memberA,
          role: 'learner',
          branchId: null,
          tenantId: tenantB,
        })
      ).status,
    ).toBe(422);
    const learner = await actors.signIn('member-a@example.test');
    expect(
      (await assign(learner, { membershipId: m.memberA1, role: 'learner', branchId: A1 })).status,
    ).toBe(403);
  });

  it('a revoked role stops working for its holder on the next request', async () => {
    const admin = await actors.signIn('admin-a@example.test');
    const ba = await actors.signIn('ba-a1@example.test');
    expect((await ba.get('/api/v1/branches')).status).toBe(200);
    const assignment = await db.roleAssignment.findFirstOrThrow({
      where: { membershipId: m.baA1, role: 'branch_admin' },
    });
    await admin.post(`/api/v1/role-assignments/${assignment.id}/revoke`, {
      reason: 'Left the branch',
    });
    expect((await ba.get('/api/v1/branches')).status).toBe(403);
  });
});

describe('first Tenant Admin from the platform (D-092)', () => {
  async function platformAdmin() {
    const id = await actors.user('psa@example.test');
    await actors.memberships().operatorGrantPlatformRole(
      { userId: id, role: 'platform_super_admin' },
      {
        userId: null,
        requestId: null,
        reason: 'fixture',
      },
    );
    return actors.signIn('psa@example.test');
  }

  it('creates the account with a set-password email, the membership and a Tenant Admin role; then 409', async () => {
    const empty = (
      await db.tenant.create({
        data: { slug: 'tenant-new', displayName: 'New (Demo)', defaultTimezone: 'Asia/Kolkata' },
      })
    ).id;
    const psa = await platformAdmin();
    const res = await psa.post(`/api/v1/platform/tenants/${empty}/first-admin`, {
      email: 'first-admin@example.test',
      displayName: 'First Admin (Demo)',
    });
    expect(res.status).toBe(201);
    const result = FirstAdminResult.parse(res.body);
    expect(result.accountCreated).toBe(true);
    expect(await db.job.count({ where: { type: 'email.password_link' } })).toBe(1);
    expect(
      await db.roleAssignment.count({
        where: { tenantId: empty, role: 'tenant_admin', revokedAt: null },
      }),
    ).toBe(1);
    // The admin follows the set-password link (D-083); from then on the tenant has a usable admin (D-095).
    await db.user.update({ where: { id: result.userId }, data: { emailVerifiedAt: new Date() } });
    const again = await psa.post(`/api/v1/platform/tenants/${empty}/first-admin`, {
      email: 'someone-else@example.test',
      displayName: 'Someone (Demo)',
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('TENANT_HAS_ADMIN');
    // Platform staff still have no access inside the tenant.
    expect((await psa.get('/api/v1/branches')).status).toBe(403);
  });

  it('only platform staff can call it; unknown tenant 404; tenant admins get 403', async () => {
    const psa = await platformAdmin();
    expect(
      (
        await psa.post(
          '/api/v1/platform/tenants/01900000-0000-7000-8000-00000000dead/first-admin',
          {
            email: 'x@example.test',
            displayName: 'X',
          },
        )
      ).status,
    ).toBe(404);
    const admin = await actors.signIn('admin-a@example.test');
    expect(
      (
        await admin.post(`/api/v1/platform/tenants/${tenantB}/first-admin`, {
          email: 'x@example.test',
          displayName: 'X',
        })
      ).status,
    ).toBe(403);
  });
});

describe('isolation audit 2.4b fixes', () => {
  async function platformAdmin(email = 'psa@example.test') {
    const id = await actors.user(email);
    await actors
      .memberships()
      .operatorGrantPlatformRole(
        { userId: id, role: 'platform_super_admin' },
        { userId: null, requestId: null, reason: 'fixture' },
      );
    return { id, session: await actors.signIn(email) };
  }
  const newTenant = async (slug = 'tenant-new') =>
    (
      await db.tenant.create({
        data: { slug, displayName: `${slug} (Demo)`, defaultTimezone: 'Asia/Kolkata' },
      })
    ).id;

  it('first-admin refuses the caller’s own account and any platform staff account (D-095)', async () => {
    const empty = await newTenant();
    const psa = await platformAdmin();
    await platformAdmin('psa-2@example.test');
    for (const email of ['psa@example.test', 'psa-2@example.test']) {
      const res = await psa.session.post(`/api/v1/platform/tenants/${empty}/first-admin`, {
        email,
        displayName: 'Staff (Demo)',
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATE');
    }
    expect(await db.membership.count({ where: { tenantId: empty } })).toBe(0);
  });

  it('an admin who never set a password does not count: a corrected address can still be set up (D-095)', async () => {
    const empty = await newTenant();
    const psa = await platformAdmin();
    const typo = await psa.session.post(`/api/v1/platform/tenants/${empty}/first-admin`, {
      email: 'frist-admin@example.test',
      displayName: 'Typo (Demo)',
    });
    expect(typo.status).toBe(201);
    const fixed = await psa.session.post(`/api/v1/platform/tenants/${empty}/first-admin`, {
      email: 'first-admin@example.test',
      displayName: 'First Admin (Demo)',
    });
    expect(fixed.status).toBe(201);
    // Once an admin has set a password, the route is closed.
    await db.user.update({
      where: { email: 'first-admin@example.test' },
      data: { emailVerifiedAt: new Date() },
    });
    const third = await psa.session.post(`/api/v1/platform/tenants/${empty}/first-admin`, {
      email: 'third@example.test',
      displayName: 'Third (Demo)',
    });
    expect(third.body.error.code).toBe('TENANT_HAS_ADMIN');
  });

  it('reusing an existing account is audited as such', async () => {
    const empty = await newTenant();
    const psa = await platformAdmin();
    const res = await psa.session.post(`/api/v1/platform/tenants/${empty}/first-admin`, {
      email: 'admin-b@example.test',
      displayName: 'ignored',
    });
    expect(FirstAdminResult.parse(res.body).accountCreated).toBe(false);
    const event = await db.auditEvent.findFirstOrThrow({
      where: { tenantId: empty, action: 'role.assigned' },
    });
    expect(event.after).toMatchObject({ accountReused: true });
  });

  it('roles go only to active, non-staff accounts', async () => {
    const s = await actors.signIn('admin-a@example.test');
    const staff = await platformAdmin('staff@example.test');
    const { membershipId } = await actors.grant(staff.id, tenantA, 'learner');
    const res = await assign(s, { membershipId, role: 'learning_manager', branchId: null });
    expect(res.status).toBe(409);
    const memberA = await db.membership.findUniqueOrThrow({ where: { id: m.memberA } });
    await db.user.update({
      where: { id: memberA.userId },
      data: { status: 'deactivated', deactivatedAt: new Date() },
    });
    expect(
      (await assign(s, { membershipId: m.memberA, role: 'instructor', branchId: null })).status,
    ).toBe(409);
  });

  it('the same assignment sent twice at once creates one row: 201 and 409, never a 500', async () => {
    const s = await actors.signIn('admin-a@example.test');
    const body = { membershipId: m.memberA, role: 'compliance_viewer', branchId: null };
    const results = await Promise.all([assign(s, body), assign(s, body)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await db.roleAssignment.count({
        where: { membershipId: m.memberA, role: 'compliance_viewer', revokedAt: null },
      }),
    ).toBe(1);
  });

  it('a Branch Admin cannot change its own roles either', async () => {
    const baUser = (await db.membership.findUniqueOrThrow({ where: { id: m.baA1 } })).userId;
    const admin = await actors.signIn('admin-a@example.test');
    const own = RoleAssignmentView.parse(
      (await assign(admin, { membershipId: m.baA1, role: 'learner', branchId: A1 })).body,
    );
    const ba = await actors.signIn('ba-a1@example.test');
    expect(baUser).toBeTruthy();
    expect(
      (await ba.post(`/api/v1/role-assignments/${own.id}/revoke`, { reason: 'Myself' })).body.error
        .code,
    ).toBe('SELF_CHANGE');
  });
});
