import type { INestApplication } from '@nestjs/common';
import { BranchListPage, PeopleListPage } from '@vachelearn/contracts';
import type { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../src/auth/passwords';
import { createTestApp } from './app';
import { resetDatabase, testPrisma } from './db';
import { realActors, TEST_PASSWORD } from './sessions';
import { buildTwoTenants, emailOf, type Person, type TwoTenants } from './two-tenants';

/*
 * Release gate (Slice 2.6b; .claude/rules/testing.md): every R1 tenant-owned resource — branches, people
 * (memberships), role assignments, job roles, tenant settings, audit log — checked on the shared two-tenant fixture for
 * each role: lists never include another tenant's or another branch's rows; by-id reads and changes across the
 * boundary are 404 and change nothing; `branchId` filters, cursors and body fields never widen access; a person in
 * both tenants sees only the organisation they are working in.
 */

// The fixture creates 14 accounts with their roles, and the matrix signs many of them in: more than the default
// 10 s on a loaded machine (a timed-out build then races the next reset).
vi.setConfig({ hookTimeout: 60_000, testTimeout: 90_000 });

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

const signIn = (person: Person | 'staff') => actors.signIn(emailOf(person));
type Session = Awaited<ReturnType<typeof signIn>>;

async function peopleIds(s: Session, query = '') {
  const res = await s.get(`/api/v1/people?limit=100${query}`);
  return res.status === 200
    ? PeopleListPage.parse(res.body)
        .data.map((p) => p.membershipId)
        .sort()
    : res.status;
}
async function branchIds(s: Session, query = '') {
  const res = await s.get(`/api/v1/branches?limit=100${query}`);
  return res.status === 200
    ? BranchListPage.parse(res.body)
        .data.map((b) => b.id)
        .sort()
    : res.status;
}
const sorted = (ids: string[]) => [...ids].sort();

describe('lists never cross a tenant or branch boundary, per role', () => {
  it('people and branches: tenant-wide readers see their tenant, A1-scoped readers see A1, others nothing', async () => {
    const m = f.member;
    const allA = sorted([
      m.adminA,
      m.baA1,
      m.lmA,
      m.lmA1,
      m.cvA,
      m.cvA1,
      m.insA1,
      m.learnerA1,
      m.learnerA2,
      m.bothA,
    ]);
    const inA1 = sorted([m.baA1, m.lmA1, m.cvA1, m.insA1, m.learnerA1]);
    const expected: [Person, string[] | number, string[] | number][] = [
      ['adminA', allA, sorted([f.branch.A1, f.branch.A2])],
      ['lmA', allA, sorted([f.branch.A1, f.branch.A2])],
      ['cvA', allA, sorted([f.branch.A1, f.branch.A2])],
      ['baA1', inA1, [f.branch.A1]],
      ['lmA1', inA1, [f.branch.A1]],
      ['cvA1', inA1, [f.branch.A1]],
      // Instructors read only their own learners (Phase 4: none yet); no branch list.
      ['insA1', [], 403],
      ['learnerA1', 403, 403],
      ['adminB', sorted([m.adminB, m.baB1, m.learnerB1, m.bothB]), [f.branch.B1]],
    ];
    for (const [person, people, branches] of expected) {
      const s = await signIn(person);
      expect({ person, people: await peopleIds(s) }).toEqual({ person, people });
      expect({ person, branches: await branchIds(s) }).toEqual({ person, branches });
    }
  });

  it('a branchId filter outside the reader’s scope lists nobody (never widens)', async () => {
    const adminA = await signIn('adminA');
    expect(await peopleIds(adminA, `&branchId=${f.branch.B1}`)).toEqual([]);
    const lmA1 = await signIn('lmA1');
    expect(await peopleIds(lmA1, `&branchId=${f.branch.A2}`)).toEqual([]);
    const cvA1 = await signIn('cvA1');
    expect(await peopleIds(cvA1, `&branchId=${f.branch.A2}`)).toEqual([]);
    // Positive control: the same filter inside the scope does list (a filter that always returned [] would fail).
    expect(await peopleIds(lmA1, `&branchId=${f.branch.A1}`)).toEqual(
      sorted([f.member.baA1, f.member.lmA1, f.member.cvA1, f.member.insA1, f.member.learnerA1]),
    );
  });

  it('a cursor from another tenant’s or branch’s list is refused (422)', async () => {
    const adminB = await signIn('adminB');
    const bPage = PeopleListPage.parse((await adminB.get('/api/v1/people?limit=1')).body);
    const adminA = await signIn('adminA');
    const aPage = PeopleListPage.parse((await adminA.get('/api/v1/people?limit=1')).body);
    const aBranches = BranchListPage.parse((await adminA.get('/api/v1/branches?limit=1')).body);
    // Real cursors only (a null one would be refused for the wrong reason), and each works for its own reader.
    for (const page of [bPage, aPage, aBranches])
      expect(page.page.nextCursor).toEqual(expect.any(String));
    expect(
      (await adminB.get(`/api/v1/people?limit=1&cursor=${bPage.page.nextCursor}`)).status,
    ).toBe(200);
    expect(
      (await adminA.get(`/api/v1/branches?limit=1&cursor=${aBranches.page.nextCursor}`)).status,
    ).toBe(200);
    expect(
      (await adminA.get(`/api/v1/people?limit=1&cursor=${bPage.page.nextCursor}`)).status,
    ).toBe(422);
    const lmA1 = await signIn('lmA1');
    expect((await lmA1.get(`/api/v1/people?limit=1&cursor=${aPage.page.nextCursor}`)).status).toBe(
      422,
    );
    expect(
      (await lmA1.get(`/api/v1/branches?limit=1&cursor=${aBranches.page.nextCursor}`)).status,
    ).toBe(422);
  });

  it('job roles, settings and the audit log are the reader’s own tenant’s only', async () => {
    const adminB = await signIn('adminB');
    expect((await adminB.post('/api/v1/job-roles', { name: 'Rigger (B)' })).status).toBe(201);
    const adminA = await signIn('adminA');
    expect((await adminA.post('/api/v1/job-roles', { name: 'Welder (A)' })).status).toBe(201);
    for (const person of ['adminA', 'baA1', 'lmA1', 'cvA'] as const) {
      const s = await signIn(person);
      const roles = (await s.get('/api/v1/job-roles')).body as { data: { name: string }[] };
      expect({ person, roles: roles.data.map((r) => r.name) }).toEqual({
        person,
        roles: ['Welder (A)'],
      });
      const settings = (await s.get('/api/v1/tenant-settings')).body as { slug: string };
      expect(settings.slug).toBe('tenant-a');
    }
    const bIds = new Set(
      (
        await db.auditEvent.findMany({
          where: { tenantId: f.tenant.B },
          select: { entityId: true },
        })
      ).map((e) => e.entityId),
    );
    expect(bIds.size).toBeGreaterThan(0);
    for (const person of ['adminA', 'cvA', 'baA1', 'cvA1'] as const) {
      const s = await signIn(person);
      // Every page, not just the newest: each event returned is one of tenant A's.
      let cursor: string | null = null;
      const seen: { id: string; entityId: string }[] = [];
      do {
        const page = (
          await s.get(`/api/v1/audit-events?limit=100${cursor ? `&cursor=${cursor}` : ''}`)
        ).body as { data: { id: string; entityId: string }[]; page: { nextCursor: string | null } };
        seen.push(...page.data);
        cursor = page.page.nextCursor;
      } while (cursor);
      // Checked against the database after reading (signing in writes tenant A events of its own).
      const foreign = await db.auditEvent.count({
        where: { id: { in: seen.map((e) => e.id) }, NOT: { tenantId: f.tenant.A } },
      });
      expect({ person, read: seen.length > 0, foreign }).toEqual({
        person,
        read: true,
        foreign: 0,
      });
      expect(seen.some((e) => bIds.has(e.entityId))).toBe(false);
      expect(JSON.stringify(seen)).not.toContain(f.branch.B1);
    }
  });
});

describe('by id: across the boundary is 404 and changes nothing', () => {
  it('reads by id of another tenant’s or another branch’s records', async () => {
    const adminA = await signIn('adminA');
    for (const path of [
      `/api/v1/people/${f.member.learnerB1}`,
      `/api/v1/branches/${f.branch.B1}`,
      `/api/v1/role-assignments?membershipId=${f.member.learnerB1}`,
    ]) {
      expect({ path, status: (await adminA.get(path)).status }).toEqual({ path, status: 404 });
    }
    for (const person of ['baA1', 'lmA1', 'cvA1'] as const) {
      const s = await signIn(person);
      expect((await s.get(`/api/v1/people/${f.member.learnerA2}`)).status).toBe(404);
      expect((await s.get(`/api/v1/branches/${f.branch.A2}`)).status).toBe(404);
      expect((await s.get(`/api/v1/people/${f.member.learnerB1}`)).status).toBe(404);
    }
    const baA1 = await signIn('baA1');
    expect(
      (await baA1.get(`/api/v1/role-assignments?membershipId=${f.member.learnerA2}`)).status,
    ).toBe(404);
    // Positive controls: the same routes answer for records in scope (a route that 404s everything would fail).
    expect((await adminA.get(`/api/v1/people/${f.member.learnerA2}`)).status).toBe(200);
    expect((await adminA.get(`/api/v1/branches/${f.branch.A2}`)).status).toBe(200);
    expect((await baA1.get(`/api/v1/people/${f.member.learnerA1}`)).status).toBe(200);
    expect((await baA1.get(`/api/v1/branches/${f.branch.A1}`)).status).toBe(200);
    expect(
      (await baA1.get(`/api/v1/role-assignments?membershipId=${f.member.learnerA1}`)).status,
    ).toBe(200);
  });

  it('changes to another tenant’s records are 404 and nothing is written', async () => {
    const adminB = await signIn('adminB');
    const created = await adminB.post('/api/v1/job-roles', { name: 'Rigger (B)' });
    expect(created.status).toBe(201);
    const roleB = created.body as { id: string };
    const assignmentB = await db.roleAssignment.findFirstOrThrow({
      where: { membershipId: f.member.learnerB1 },
    });
    const before = await db.auditEvent.count({ where: { tenantId: f.tenant.B } });
    const snapshot = async () => ({
      member: await db.membership.findUniqueOrThrow({ where: { id: f.member.learnerB1 } }),
      branch: await db.branch.findUniqueOrThrow({ where: { id: f.branch.B1 } }),
      assignment: await db.roleAssignment.findUniqueOrThrow({ where: { id: assignmentB.id } }),
      jobRole: await db.jobRole.findUniqueOrThrow({ where: { id: roleB.id } }),
      roles: await db.roleAssignment.count({ where: { membershipId: f.member.learnerB1 } }),
    });
    const unchanged = await snapshot();
    const adminA = await signIn('adminA');
    // Lazy: each request is created when it runs (supertest binds a server per request object).
    const attempts: [string, () => PromiseLike<{ status: number }>][] = [
      [
        'update member',
        () => adminA.patch(`/api/v1/people/${f.member.learnerB1}`, { version: 1, department: 'X' }),
      ],
      [
        'deactivate member',
        () =>
          adminA.post(`/api/v1/people/${f.member.learnerB1}/deactivate`, { reason: 'Not mine' }),
      ],
      [
        'add branch',
        () =>
          adminA.post(`/api/v1/people/${f.member.learnerB1}/branches`, { branchId: f.branch.A1 }),
      ],
      [
        'update branch',
        () => adminA.patch(`/api/v1/branches/${f.branch.B1}`, { version: 1, name: 'Mine' }),
      ],
      [
        'deactivate branch',
        () => adminA.post(`/api/v1/branches/${f.branch.B1}/deactivate`, { reason: 'Not mine' }),
      ],
      [
        'assign role',
        () =>
          adminA.post('/api/v1/role-assignments', {
            membershipId: f.member.learnerB1,
            role: 'instructor',
            branchId: null,
          }),
      ],
      [
        'revoke role',
        () =>
          adminA.post(`/api/v1/role-assignments/${assignmentB.id}/revoke`, { reason: 'Not mine' }),
      ],
      [
        'rename job role',
        () => adminA.patch(`/api/v1/job-roles/${roleB.id}`, { version: 1, name: 'Mine' }),
      ],
      [
        'deactivate job role',
        () => adminA.post(`/api/v1/job-roles/${roleB.id}/deactivate`, { reason: 'Not mine' }),
      ],
    ];
    for (const [what, attempt] of attempts) {
      expect({ what, status: (await attempt()).status }).toEqual({ what, status: 404 });
    }
    expect(await db.auditEvent.count({ where: { tenantId: f.tenant.B } })).toBe(before);
    expect(await snapshot()).toEqual(unchanged);
    expect(await db.membershipBranch.count({ where: { membershipId: f.member.learnerB1 } })).toBe(
      1,
    );
  });

  it('a body naming a tenant is refused (422): the tenant is always the session’s', async () => {
    const adminA = await signIn('adminA');
    expect(
      (
        await adminA.post('/api/v1/branches', {
          code: 'X1',
          name: 'X',
          timezone: 'Asia/Kolkata',
          tenantId: f.tenant.B,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await adminA.patch('/api/v1/tenant-settings', {
          version: 1,
          displayName: 'X',
          tenantId: f.tenant.B,
        })
      ).status,
    ).toBe(422);
    expect(
      (await adminA.post('/api/v1/job-roles', { name: 'X role', tenantId: f.tenant.B })).status,
    ).toBe(422);
    expect(await db.branch.count({ where: { tenantId: f.tenant.B } })).toBe(1);
    expect(await db.branch.count({ where: { code: 'X1' } })).toBe(0);
    expect(await db.jobRole.count({ where: { name: 'X role' } })).toBe(0);
    expect((await db.tenant.findUniqueOrThrow({ where: { id: f.tenant.A } })).displayName).toBe(
      'tenant-a (Demo)',
    );
  });
});

describe('the remaining R1 routes (isolation audit 2.6b)', () => {
  it('platform staff without a support session read no tenant data; instructors and learners no settings', async () => {
    const staff = await signIn('staff');
    for (const path of [
      '/api/v1/people',
      '/api/v1/branches',
      '/api/v1/job-roles',
      '/api/v1/tenant-settings',
      '/api/v1/audit-events',
    ]) {
      expect({ path, status: (await staff.get(path)).status }).toEqual({ path, status: 403 });
    }
    for (const person of ['insA1', 'learnerA1'] as const) {
      const s = await signIn(person);
      expect((await s.get('/api/v1/job-roles')).status).toBe(403);
      expect((await s.get('/api/v1/tenant-settings')).status).toBe(403);
      expect((await s.get('/api/v1/audit-events')).status).toBe(403);
    }
  });

  it('job roles: another tenant cannot reactivate one, and a cursor does not cross tenants', async () => {
    const adminB = await signIn('adminB');
    for (const name of ['Rigger (B)', 'Slinger (B)']) {
      expect((await adminB.post('/api/v1/job-roles', { name })).status).toBe(201);
    }
    const list = (await adminB.get('/api/v1/job-roles?limit=1')).body as {
      data: { id: string }[];
      page: { nextCursor: string | null };
    };
    expect(list.page.nextCursor).toEqual(expect.any(String));
    const roleB = list.data[0]!.id;
    await adminB.post(`/api/v1/job-roles/${roleB}/deactivate`, { reason: 'Merged' });
    const adminA = await signIn('adminA');
    expect(
      (await adminA.post(`/api/v1/job-roles/${roleB}/reactivate`, { reason: 'Mine' })).status,
    ).toBe(404);
    expect((await db.jobRole.findUniqueOrThrow({ where: { id: roleB } })).status).toBe('inactive');
    expect(
      (await adminA.get(`/api/v1/job-roles?limit=1&cursor=${list.page.nextCursor}`)).status,
    ).toBe(422);
    expect(
      (await adminB.get(`/api/v1/job-roles?limit=1&cursor=${list.page.nextCursor}`)).status,
    ).toBe(200);
  });

  it('member branches: no other tenant’s branch as primary; a Branch Admin cannot remove another branch or reactivate outside its branches', async () => {
    const adminA = await signIn('adminA');
    expect(
      (
        await adminA.post(`/api/v1/people/${f.member.learnerA1}/primary-branch`, {
          branchId: f.branch.B1,
        })
      ).status,
    ).toBe(404);
    // learnerA1 shares A1 with the Branch Admin and now also belongs to A2.
    expect(
      (
        await adminA.post(`/api/v1/people/${f.member.learnerA1}/branches`, {
          branchId: f.branch.A2,
        })
      ).status,
    ).toBe(200);
    const baA1 = await signIn('baA1');
    expect(
      (await baA1.post(`/api/v1/people/${f.member.learnerA1}/branches/${f.branch.A2}/remove`))
        .status,
    ).not.toBe(204);
    expect(await db.membershipBranch.count({ where: { membershipId: f.member.learnerA1 } })).toBe(
      2,
    );
    expect(
      (
        await adminA.post(`/api/v1/people/${f.member.learnerA2}/deactivate`, {
          reason: 'Left the site',
        })
      ).status,
    ).toBe(200);
    expect(
      (await baA1.post(`/api/v1/people/${f.member.learnerA2}/reactivate`, { reason: 'Mine now' }))
        .status,
    ).toBe(404);
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: f.member.learnerA2 } })).status,
    ).toBe('deactivated');
  });

  it('a branch-scoped Compliance Viewer reads only its branch’s audit events (D-109)', async () => {
    const cvA1 = await signIn('cvA1');
    const events = (await cvA1.get('/api/v1/audit-events?limit=100')).body as {
      data: { branch: { id: string } | null }[];
    };
    expect(events.data.length).toBeGreaterThan(0);
    expect(events.data.every((e) => e.branch?.id === f.branch.A1)).toBe(true);
  });
});

describe('a person in both tenants', () => {
  it('works in one organisation at a time and sees only that one', async () => {
    const both = await signIn('both');
    // Two organisations and none chosen: no tenant data at all.
    expect(both.view.activeTenant).toBeNull();
    expect((await both.get('/api/v1/people')).status).toBe(403);
    // In A they are a Learner: no people list.
    expect(
      (await both.post('/api/v1/auth/session/tenant', { membershipId: f.member.bothA })).status,
    ).toBe(200);
    expect((await both.get('/api/v1/people')).status).toBe(403);
    // In B they are a tenant-wide Learning Manager: B's people, never A's.
    expect(
      (await both.post('/api/v1/auth/session/tenant', { membershipId: f.member.bothB })).status,
    ).toBe(200);
    expect(await peopleIds(both)).toEqual(
      sorted([f.member.adminB, f.member.baB1, f.member.learnerB1, f.member.bothB]),
    );
    expect((await both.get(`/api/v1/people/${f.member.learnerA2}`)).status).toBe(404);
  });
});
