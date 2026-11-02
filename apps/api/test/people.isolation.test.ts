import type { INestApplication } from '@nestjs/common';
import {
  JobRoleListPage,
  JobRoleView,
  PeopleListPage,
  PersonView,
  TenantSettingsView,
} from '@vachelearn/contracts';
import type { PrismaClient } from '../generated/prisma/client';
import { PeopleService } from '../src/people/people.service';
import { hashPassword } from '../src/auth/passwords';
import { createTestApp } from './app';
import { resetDatabase, testPrisma } from './db';
import { OPERATOR, realActors, TEST_PASSWORD } from './sessions';

/*
 * People basics (Slice 2.5a; D-026, D-047, D-101–D-105) through real sessions. Fixture: tenant A (branches A1, A2) with
 * a Tenant Admin, a Branch Admin of A1, members in A1, in A2, in both (primary A1) and tenant-wide; tenant B (B1) with
 * its own admin and member.
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
        data: {
          slug,
          displayName: `${slug} (Demo)`,
          defaultTimezone: 'Asia/Kolkata',
          settings: { create: {} },
        },
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
  const both = await user('member-a12@example.test');
  m.memberA12 = (await grant(both, tenantA, 'learner', A1)).membershipId;
  await grant(both, tenantA, 'instructor', A2);
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

type Session = Awaited<ReturnType<typeof actors.signIn>>;
const ids = (page: PeopleListPage) => page.data.map((p) => p.membershipId).sort();
const listPeople = async (s: Session, query = '') => {
  const res = await s.get(`/api/v1/people${query}`);
  expect(res.status).toBe(200);
  return PeopleListPage.parse(res.body);
};

describe('reading people', () => {
  it('a Tenant Admin lists every member of their own tenant and none of another', async () => {
    const s = await actors.signIn('admin-a@example.test');
    const page = await listPeople(s, '?limit=100');
    expect(ids(page)).toEqual(
      [m.adminA, m.baA1, m.memberA1, m.memberA2, m.memberA12, m.memberA].sort(),
    );
    const both = page.data.find((p) => p.membershipId === m.memberA12)!;
    // Tenant-wide callers see every branch and the primary marker (D-026).
    expect(both.branches).toEqual([
      { id: A1, code: 'A1', name: 'Branch A1', primary: true },
      { id: A2, code: 'A2', name: 'Branch A2', primary: false },
    ]);
  });

  it('branch admin of A1 lists only members of A1, sees only A1 and no primary marker (D-026)', async () => {
    const s = await actors.signIn('ba-a1@example.test');
    const page = await listPeople(s, '?limit=100');
    expect(ids(page)).toEqual([m.baA1, m.memberA1, m.memberA12].sort());
    const both = page.data.find((p) => p.membershipId === m.memberA12)!;
    expect(both.branches).toEqual([{ id: A1, code: 'A1', name: 'Branch A1' }]);
    // Roles on branches out of reach are not shown either.
    expect(both.roles).toEqual([
      { role: 'learner', branch: { id: A1, code: 'A1', name: 'Branch A1' } },
    ]);
  });

  it('branch admin of A1 cannot list members of A2 or of another tenant via the branchId filter', async () => {
    const s = await actors.signIn('ba-a1@example.test');
    expect((await listPeople(s, `?branchId=${A2}`)).data).toEqual([]);
    expect((await listPeople(s, `?branchId=${B1}`)).data).toEqual([]);
    expect(ids(await listPeople(s, `?branchId=${A1}&limit=100`))).toEqual(
      [m.baA1, m.memberA1, m.memberA12].sort(),
    );
  });

  it('a cursor pages through the caller’s scope and cannot be carried to another scope or tenant', async () => {
    const admin = await actors.signIn('admin-a@example.test');
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: PeopleListPage = await listPeople(
        admin,
        `?limit=2&sort=email${cursor ? `&cursor=${cursor}` : ''}`,
      );
      seen.push(...page.data.map((p) => p.email));
      cursor = page.page.nextCursor;
    } while (cursor);
    expect(seen).toEqual([...seen].sort());
    expect(seen).toHaveLength(6);

    const first = await listPeople(admin, '?limit=1');
    const ba = await actors.signIn('ba-a1@example.test');
    const adminB = await actors.signIn('admin-b@example.test');
    for (const s of [ba, adminB]) {
      const res = await s.get(`/api/v1/people?limit=1&cursor=${first.page.nextCursor}`);
      expect(res.status).toBe(422);
    }
  });

  it('a member by id from another tenant or out-of-reach branch is 404', async () => {
    const admin = await actors.signIn('admin-a@example.test');
    expect((await admin.get(`/api/v1/people/${m.memberB1}`)).status).toBe(404);
    const ba = await actors.signIn('ba-a1@example.test');
    expect((await ba.get(`/api/v1/people/${m.memberA2}`)).status).toBe(404);
    expect((await ba.get(`/api/v1/people/${m.memberA}`)).status).toBe(404);
    const view = PersonView.parse((await ba.get(`/api/v1/people/${m.memberA1}`)).body);
    expect(view).toMatchObject({ canManage: true, accountVerified: true });
    // D-101: shared with a branch the admin does not manage.
    expect(PersonView.parse((await ba.get(`/api/v1/people/${m.memberA12}`)).body).canManage).toBe(
      false,
    );
  });

  it('a learner cannot read people; search and status filter within scope', async () => {
    const learner = await actors.signIn('member-a1@example.test');
    expect((await learner.get('/api/v1/people')).status).toBe(403);
    const admin = await actors.signIn('admin-a@example.test');
    expect(ids(await listPeople(admin, '?search=MEMBER-A1'))).toEqual(
      [m.memberA1, m.memberA12].sort(),
    );
    expect((await listPeople(admin, '?status=deactivated')).data).toEqual([]);
  });
});

describe('changing a member', () => {
  it('a Tenant Admin sets the D-047 fields; audited, versioned, employee id unique ignoring case', async () => {
    const admin = await actors.signIn('admin-a@example.test');
    const role = JobRoleView.parse(
      (await admin.post('/api/v1/job-roles', { name: 'Welder' })).body,
    );
    const res = await admin.patch(`/api/v1/people/${m.memberA1}`, {
      version: 1,
      employeeId: 'E-100',
      department: 'Fabrication',
      jobRoleId: role.id,
    });
    expect(res.status).toBe(200);
    const view = PersonView.parse(res.body);
    expect(view).toMatchObject({
      employeeId: 'E-100',
      department: 'Fabrication',
      jobRole: { id: role.id, name: 'Welder' },
      version: 2,
    });
    const event = await db.auditEvent.findFirstOrThrow({
      where: { action: 'membership.updated', entityId: m.memberA1 },
    });
    // The employee id is personal: the audit records that it changed, not its value.
    expect(event.after).toMatchObject({ employeeId: '[changed]', department: 'Fabrication' });

    const stale = await admin.patch(`/api/v1/people/${m.memberA1}`, {
      version: 1,
      department: 'X',
    });
    expect(stale.status).toBe(409);
    const taken = await admin.patch(`/api/v1/people/${m.memberA2}`, {
      version: 1,
      employeeId: 'e-100',
    });
    expect(taken.status).toBe(422);
    expect(taken.body.error.fieldErrors[0]).toMatchObject({ field: 'employeeId', code: 'taken' });
  });

  it('a job role of another tenant cannot be attached (422, nothing changed)', async () => {
    const adminB = await actors.signIn('admin-b@example.test');
    const roleB = JobRoleView.parse(
      (await adminB.post('/api/v1/job-roles', { name: 'Rigger' })).body,
    );
    const admin = await actors.signIn('admin-a@example.test');
    const res = await admin.patch(`/api/v1/people/${m.memberA1}`, {
      version: 1,
      jobRoleId: roleB.id,
    });
    expect(res.status).toBe(422);
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: m.memberA1 } })).jobRoleId,
    ).toBeNull();
  });

  it('a body naming a tenant is refused (422): the tenant is the session’s', async () => {
    const admin = await actors.signIn('admin-a@example.test');
    const res = await admin.patch(`/api/v1/people/${m.memberA1}`, {
      version: 1,
      department: 'X',
      tenantId: tenantB,
    });
    expect(res.status).toBe(422);
  });

  it('branch admin of A1 edits members wholly in A1 only (D-101); never themselves; A2 is 404', async () => {
    const ba = await actors.signIn('ba-a1@example.test');
    expect(
      (await ba.patch(`/api/v1/people/${m.memberA1}`, { version: 1, department: 'Line 1' })).status,
    ).toBe(200);
    const shared = await ba.patch(`/api/v1/people/${m.memberA12}`, { version: 1, department: 'X' });
    expect(shared.status).toBe(403);
    expect(shared.body.error.code).toBe('OUTSIDE_BRANCH_SCOPE');
    expect(
      (await ba.patch(`/api/v1/people/${m.memberA2}`, { version: 1, department: 'X' })).status,
    ).toBe(404);
    const self = await ba.patch(`/api/v1/people/${m.baA1}`, { version: 1, department: 'X' });
    expect(self.status).toBe(403);
    expect(self.body.error.code).toBe('SELF_CHANGE');
  });

  it('another tenant’s admin cannot change a member of A (404, nothing changed)', async () => {
    const adminB = await actors.signIn('admin-b@example.test');
    expect(
      (await adminB.patch(`/api/v1/people/${m.memberA1}`, { version: 1, department: 'X' })).status,
    ).toBe(404);
    expect(
      (await adminB.post(`/api/v1/people/${m.memberA1}/deactivate`, { reason: 'Not mine' })).status,
    ).toBe(404);
    expect(
      (await adminB.post(`/api/v1/people/${m.memberA1}/branches`, { branchId: B1 })).status,
    ).toBe(404);
    const row = await db.membership.findUniqueOrThrow({ where: { id: m.memberA1 } });
    expect(row).toMatchObject({ status: 'active', department: null, version: 1 });
  });
});

describe('deactivation (D-102)', () => {
  it('ends the member’s sessions in this organisation, keeps roles, and reactivation restores them', async () => {
    const member = await actors.signIn('member-a1@example.test');
    expect((await member.get('/api/v1/auth/me')).status).toBe(200);
    const admin = await actors.signIn('admin-a@example.test');
    const res = await admin.post(`/api/v1/people/${m.memberA1}/deactivate`, {
      reason: 'Left the site',
    });
    expect(res.status).toBe(200);
    expect(PersonView.parse(res.body)).toMatchObject({
      status: 'deactivated',
      deactivatedReason: 'Left the site',
    });
    expect((await member.get('/api/v1/auth/me')).status).toBe(401);
    const session = await db.authSession.findFirstOrThrow({
      where: { activeMembershipId: m.memberA1 },
    });
    expect(session.endReason).toBe('membership_deactivated');
    expect(
      await db.roleAssignment.count({ where: { membershipId: m.memberA1, revokedAt: null } }),
    ).toBe(1);
    expect(
      (await admin.post(`/api/v1/people/${m.memberA1}/deactivate`, { reason: 'Again' })).status,
    ).toBe(409);

    const back = await admin.post(`/api/v1/people/${m.memberA1}/reactivate`, {
      reason: 'Returned',
    });
    expect(PersonView.parse(back.body).roles).toHaveLength(1);
    const actions = (
      await db.auditEvent.findMany({
        where: { entityId: m.memberA1 },
        orderBy: { occurredAt: 'asc' },
      })
    ).map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(['membership.deactivated', 'membership.reactivated']),
    );
  });

  it('a Branch Admin cannot deactivate a member shared with another branch, or a whole-organisation role holder', async () => {
    const ba = await actors.signIn('ba-a1@example.test');
    const res = await ba.post(`/api/v1/people/${m.memberA12}/deactivate`, { reason: 'Not here' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('OUTSIDE_BRANCH_SCOPE');
    // A whole-organisation learner in A1 too.
    await actors.grant(
      (await db.membership.findUniqueOrThrow({ where: { id: m.memberA } })).userId,
      tenantA,
      'learner',
      A1,
    );
    expect(
      (await ba.post(`/api/v1/people/${m.memberA}/deactivate`, { reason: 'Not here' })).body.error
        .code,
    ).toBe('OUTSIDE_BRANCH_SCOPE');
    expect(
      (await ba.post(`/api/v1/people/${m.memberA1}/deactivate`, { reason: 'Left' })).status,
    ).toBe(200);
  });

  it('nobody deactivates themselves; the last usable Tenant Admin cannot be deactivated (D-091, D-095)', async () => {
    const admin = await actors.signIn('admin-a@example.test');
    const self = await admin.post(`/api/v1/people/${m.adminA}/deactivate`, { reason: 'Myself' });
    expect(self.body.error.code).toBe('SELF_CHANGE');
    // A Tenant Admin acting is always a usable admin, so the rule is reached only by a caller outside the tenant's
    // memberships (operator or test context): checked on the service directly.
    const people = app.get(PeopleService);
    await expect(
      people.setActive(
        {
          requestId: 'req_test',
          userId: (await db.membership.findUniqueOrThrow({ where: { id: m.baA1 } })).userId,
          platform: null,
          tenant: {
            tenantId: tenantA,
            permissions: new Set(['user.deactivate']),
            branchScope: 'ALL',
          },
        },
        m.adminA!,
        false,
        'Test',
      ),
    ).rejects.toMatchObject({ code: 'LAST_TENANT_ADMIN' });
  });
});

describe('branch membership (D-026, D-104)', () => {
  it('a Tenant Admin adds a branch, moves the primary, and removes a branch once no live role uses it', async () => {
    const admin = await actors.signIn('admin-a@example.test');
    const added = PersonView.parse(
      (await admin.post(`/api/v1/people/${m.memberA1}/branches`, { branchId: A2 })).body,
    );
    expect(added.branches.map((b) => [b.code, b.primary])).toEqual([
      ['A1', true],
      ['A2', false],
    ]);
    const primary = await admin.post(`/api/v1/people/${m.memberA1}/branches/${A1}/remove`);
    expect(primary.status).toBe(409);
    expect(primary.body.error.code).toBe('PRIMARY_BRANCH');
    await admin.post(`/api/v1/people/${m.memberA1}/primary-branch`, { branchId: A2 });
    const live = await admin.post(`/api/v1/people/${m.memberA1}/branches/${A1}/remove`);
    expect(live.status).toBe(409);
    expect(live.body.error.code).toBe('BRANCH_HAS_ROLE');
    // Revoked roles are history: they no longer stop the member leaving the branch (D-104).
    const assignment = await db.roleAssignment.findFirstOrThrow({
      where: { membershipId: m.memberA1, branchId: A1 },
    });
    await admin.post(`/api/v1/role-assignments/${assignment.id}/revoke`, { reason: 'Moved' });
    expect((await admin.post(`/api/v1/people/${m.memberA1}/branches/${A1}/remove`)).status).toBe(
      204,
    );
    expect(await db.membershipBranch.count({ where: { membershipId: m.memberA1 } })).toBe(1);
    expect(
      await db.auditEvent.count({
        where: { action: 'membership.branch_removed', entityId: m.memberA1 },
      }),
    ).toBe(1);
  });

  it('branches out of reach or of another tenant are 404 and nothing is added', async () => {
    const ba = await actors.signIn('ba-a1@example.test');
    expect((await ba.post(`/api/v1/people/${m.memberA1}/branches`, { branchId: A2 })).status).toBe(
      404,
    );
    const admin = await actors.signIn('admin-a@example.test');
    expect(
      (await admin.post(`/api/v1/people/${m.memberA1}/branches`, { branchId: B1 })).status,
    ).toBe(404);
    expect(await db.membershipBranch.count({ where: { membershipId: m.memberA1 } })).toBe(1);
  });

  it('the database refuses a branch role without the branch membership, and removing a branch with a live role', async () => {
    await expect(
      db.roleAssignment.create({
        data: { tenantId: tenantA, membershipId: m.memberA1!, role: 'instructor', branchId: A2 },
      }),
    ).rejects.toThrow(/role_assignments_on_member_branch/);
    await expect(
      db.membershipBranch.delete({
        where: { membershipId_branchId: { membershipId: m.memberA1!, branchId: A1 } },
      }),
    ).rejects.toThrow(/membership_branches_no_live_role/);
  });
});

describe('job roles and tenant settings', () => {
  it('job roles: unique per tenant ignoring case, invisible to other tenants, managed by Tenant Admins only', async () => {
    const admin = await actors.signIn('admin-a@example.test');
    const welder = JobRoleView.parse(
      (await admin.post('/api/v1/job-roles', { name: 'Welder' })).body,
    );
    expect((await admin.post('/api/v1/job-roles', { name: 'welder' })).status).toBe(422);
    const adminB = await actors.signIn('admin-b@example.test');
    expect(JobRoleListPage.parse((await adminB.get('/api/v1/job-roles')).body).data).toEqual([]);
    expect(
      (await adminB.patch(`/api/v1/job-roles/${welder.id}`, { version: 1, name: 'Mine' })).status,
    ).toBe(404);
    expect(
      (await adminB.post(`/api/v1/job-roles/${welder.id}/deactivate`, { reason: 'Mine' })).status,
    ).toBe(404);
    const ba = await actors.signIn('ba-a1@example.test');
    expect(JobRoleListPage.parse((await ba.get('/api/v1/job-roles')).body).data).toHaveLength(1);
    expect((await ba.post('/api/v1/job-roles', { name: 'Fitter' })).status).toBe(403);

    const off = await admin.post(`/api/v1/job-roles/${welder.id}/deactivate`, { reason: 'Merged' });
    expect(JobRoleView.parse(off.body).status).toBe('inactive');
    // An inactive role cannot be newly chosen.
    expect(
      (await admin.patch(`/api/v1/people/${m.memberA1}`, { version: 1, jobRoleId: welder.id }))
        .status,
    ).toBe(422);
  });

  it('tenant settings: the caller’s own tenant only; versioned and audited; Branch Admin reads, cannot change', async () => {
    const admin = await actors.signIn('admin-a@example.test');
    const view = TenantSettingsView.parse((await admin.get('/api/v1/tenant-settings')).body);
    expect(view).toMatchObject({ slug: 'tenant-a', defaultLocale: 'en-IN' });
    const res = await admin.patch('/api/v1/tenant-settings', {
      version: view.version,
      displayName: 'Tenant A Works (Demo)',
      defaultTimezone: 'America/Chicago',
    });
    expect(TenantSettingsView.parse(res.body)).toMatchObject({
      displayName: 'Tenant A Works (Demo)',
      defaultTimezone: 'America/Chicago',
    });
    expect(
      (await admin.patch('/api/v1/tenant-settings', { version: view.version, displayName: 'Old' }))
        .status,
    ).toBe(409);
    expect(
      await db.auditEvent.count({
        where: { action: 'tenant_settings.updated', tenantId: tenantA },
      }),
    ).toBe(1);
    expect((await db.tenant.findUniqueOrThrow({ where: { id: tenantB } })).displayName).toBe(
      'tenant-b (Demo)',
    );

    const ba = await actors.signIn('ba-a1@example.test');
    expect((await ba.get('/api/v1/tenant-settings')).status).toBe(200);
    expect(
      (await ba.patch('/api/v1/tenant-settings', { version: 2, displayName: 'Mine' })).status,
    ).toBe(403);
  });
});

describe('review fixes 2.5a', () => {
  it('branch admin of A1 cannot deactivate or edit a peer branch admin or a learning manager of A1 (D-101 amendment)', async () => {
    const peer = (
      await actors.grant(await actors.user('ba2-a1@example.test'), tenantA, 'branch_admin', A1)
    ).membershipId;
    const lm = (
      await actors.grant(await actors.user('lm-a1@example.test'), tenantA, 'learning_manager', A1)
    ).membershipId;
    const ba = await actors.signIn('ba-a1@example.test');
    for (const id of [peer, lm]) {
      const res = await ba.post(`/api/v1/people/${id}/deactivate`, { reason: 'Not allowed' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('OUTSIDE_BRANCH_SCOPE');
      expect((await ba.patch(`/api/v1/people/${id}`, { version: 1, department: 'X' })).status).toBe(
        403,
      );
      expect(PersonView.parse((await ba.get(`/api/v1/people/${id}`)).body).canManage).toBe(false);
    }
    expect(await db.membership.count({ where: { id: { in: [peer, lm] }, status: 'active' } })).toBe(
      2,
    );
  });

  it('a people cursor carries no name or email, and still pages in order', async () => {
    const admin = await actors.signIn('admin-a@example.test');
    for (const sort of ['name', 'email']) {
      const page = await listPeople(admin, `?limit=2&sort=${sort}`);
      const payload = Buffer.from(page.page.nextCursor!.split('.')[0]!, 'base64url').toString();
      expect(payload).not.toMatch(/@|example|Demo/);
      const next = await listPeople(admin, `?limit=2&sort=${sort}&cursor=${page.page.nextCursor}`);
      const key = (p: PeopleListPage['data'][number]) =>
        sort === 'name' ? p.displayName : p.email;
      expect(key(next.data[0]!) > key(page.data[1]!)).toBe(true);
    }
  });

  it('a learning manager of A1 lists A1 only and does not see deactivation reasons (D-106); an instructor lists nobody', async () => {
    await actors.grant(await actors.user('lm-a1@example.test'), tenantA, 'learning_manager', A1);
    const admin = await actors.signIn('admin-a@example.test');
    await admin.post(`/api/v1/people/${m.memberA1}/deactivate`, { reason: 'Sensitive note' });
    const lm = await actors.signIn('lm-a1@example.test');
    const page = await listPeople(lm, '?limit=100');
    expect(page.data.every((p) => p.branches.every((b) => b.id === A1))).toBe(true);
    expect(ids(page)).not.toContain(m.memberA2);
    const view = PersonView.parse((await lm.get(`/api/v1/people/${m.memberA1}`)).body);
    expect(view).toMatchObject({
      status: 'deactivated',
      deactivatedReason: null,
      canManage: false,
    });
    expect(
      PersonView.parse((await admin.get(`/api/v1/people/${m.memberA1}`)).body).deactivatedReason,
    ).toBe('Sensitive note');

    await actors.grant(await actors.user('ins-a2@example.test'), tenantA, 'instructor', A2);
    const ins = await actors.signIn('ins-a2@example.test');
    expect((await listPeople(ins)).data).toEqual([]);
    expect((await ins.get(`/api/v1/people/${m.memberA2}`)).status).toBe(404);
  });

  it('a branch admin who manages all of a member’s branches sees the primary marker in the detail only', async () => {
    const admin = await actors.signIn('admin-a@example.test');
    await admin.post(`/api/v1/people/${m.memberA1}/branches`, { branchId: A2 });
    // Branch Admin of A1 and A2 now reaches all of memberA1's branches.
    await actors.grant(
      (await db.membership.findUniqueOrThrow({ where: { id: m.baA1 } })).userId,
      tenantA,
      'branch_admin',
      A2,
    );
    const ba = await actors.signIn('ba-a1@example.test');
    const view = PersonView.parse(
      (await ba.patch(`/api/v1/people/${m.memberA1}`, { version: 2, department: 'Line 2' })).body,
    );
    // memberA1 lies wholly within the admin's branches (D-101): the primary marker reveals nothing outside its scope.
    expect(view.branches.map((b) => [b.code, b.primary])).toEqual([
      ['A1', true],
      ['A2', false],
    ]);
    // In the list, branch-scoped readers still get no marker (D-026).
    const page = await listPeople(ba, '?limit=100');
    expect(
      page.data
        .find((p) => p.membershipId === m.memberA1)!
        .branches.every((b) => b.primary === undefined),
    ).toBe(true);
  });

  it('another tenant cannot reactivate, remove or re-prime branches of A’s members (404, nothing changed)', async () => {
    const admin = await actors.signIn('admin-a@example.test');
    await admin.post(`/api/v1/people/${m.memberA2}/deactivate`, { reason: 'Left the site' });
    const adminB = await actors.signIn('admin-b@example.test');
    expect(
      (await adminB.post(`/api/v1/people/${m.memberA2}/reactivate`, { reason: 'Mine now' })).status,
    ).toBe(404);
    expect((await adminB.post(`/api/v1/people/${m.memberA1}/branches/${A1}/remove`)).status).toBe(
      404,
    );
    expect(
      (await adminB.post(`/api/v1/people/${m.memberA1}/primary-branch`, { branchId: A1 })).status,
    ).toBe(404);
    const ba = await actors.signIn('ba-a1@example.test');
    expect(
      (await ba.post(`/api/v1/people/${m.memberA1}/primary-branch`, { branchId: A2 })).status,
    ).toBe(404);
    expect((await db.membership.findUniqueOrThrow({ where: { id: m.memberA2 } })).status).toBe(
      'deactivated',
    );
    expect(await db.membershipBranch.count({ where: { membershipId: m.memberA1 } })).toBe(1);
  });

  it('job roles and employee ids are per tenant: another tenant’s role filters nobody; the same employee id is fine elsewhere', async () => {
    const adminB = await actors.signIn('admin-b@example.test');
    const roleB = JobRoleView.parse(
      (await adminB.post('/api/v1/job-roles', { name: 'Rigger' })).body,
    );
    await adminB.patch(`/api/v1/people/${m.memberB1}`, {
      version: 1,
      employeeId: 'E-1',
      jobRoleId: roleB.id,
    });
    const admin = await actors.signIn('admin-a@example.test');
    expect((await listPeople(admin, `?jobRoleId=${roleB.id}`)).data).toEqual([]);
    expect(
      (await admin.patch(`/api/v1/people/${m.memberA1}`, { version: 1, employeeId: 'E-1' })).status,
    ).toBe(200);
  });

  it('a deactivated membership cannot be chosen as the active organisation', async () => {
    const member = await actors.signIn('member-a12@example.test');
    const admin = await actors.signIn('admin-a@example.test');
    await admin.post(`/api/v1/people/${m.memberA12}/deactivate`, { reason: 'Left the site' });
    const again = await actors.signIn('member-a12@example.test');
    expect(again.view.activeTenant).toBeNull();
    expect(
      (await again.post('/api/v1/auth/session/tenant', { membershipId: m.memberA12 })).status,
    ).toBe(404);
    expect((await member.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('a support session reads people but changes nothing on the new routes (D-037)', async () => {
    const staff = await actors.user('psa@example.test');
    await actors
      .memberships()
      .operatorGrantPlatformRole({ userId: staff, role: 'platform_super_admin' }, OPERATOR);
    const s = await actors.signIn('psa@example.test');
    expect(
      (
        await s.post('/api/v1/platform/support-sessions', {
          tenantId: tenantA,
          reason: 'Ticket 1: checking people',
        })
      ).status,
    ).toBe(201);
    const view = PersonView.parse((await s.get(`/api/v1/people/${m.memberA1}`)).body);
    expect(view.canManage).toBe(false);
    for (const res of [
      await s.patch(`/api/v1/people/${m.memberA1}`, { version: 1, department: 'X' }),
      await s.post(`/api/v1/people/${m.memberA1}/deactivate`, { reason: 'Support' }),
      await s.post('/api/v1/job-roles', { name: 'Support role' }),
      await s.patch('/api/v1/tenant-settings', { version: 1, displayName: 'Support' }),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('SUPPORT_READ_ONLY');
    }
    expect(await db.auditEvent.count({ where: { action: 'support.denied' } })).toBe(4);
  });
});
