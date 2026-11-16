import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  AddGroupMembersResult,
  GroupListPage,
  GroupMemberListPage,
  GroupMemberView,
  GroupView,
  InvitationView,
} from '@vachelearn/contracts';
import request from 'supertest';
import type { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../src/auth/passwords';
import { hashSessionToken } from '../src/auth/session-tokens';
import { LEFT_BRANCH_REASON } from '../src/groups/groups.service';
import { createTestApp, WEB } from './app';
import { resetDatabase, testPrisma } from './db';
import { realActors, TEST_PASSWORD } from './sessions';
import { buildTwoTenants, emailOf, type Person, type TwoTenants } from './two-tenants';

/*
 * Groups (Slice 3.2; spec §5 ACs "branch admin can only manage groups and members within their branches; removing a
 * member preserves history"; D-119–D-122; matrix `group.*`) through real sessions on the shared two-tenant fixture.
 */

let app: INestApplication;
let db: PrismaClient;
let actors: ReturnType<typeof realActors>;
let f: TwoTenants;
let seq = 0;

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

async function create(person: Person, body: { name: string; branchId: string | null }) {
  return (await as(person)).post('/api/v1/groups', body);
}
async function created(person: Person, body: { name: string; branchId: string | null }) {
  const res = await create(person, body);
  expect(res.status).toBe(201);
  return GroupView.parse(res.body);
}
async function list(person: Person, query = '') {
  const res = await (await as(person)).get(`/api/v1/groups${query}`);
  expect(res.status).toBe(200);
  return GroupListPage.parse(res.body);
}
const names = (page: GroupListPage) => page.data.map((g) => g.name).sort();

/** The fixture's three kinds of group in tenant A, plus one in tenant B. */
async function groups() {
  return {
    tenantWide: await created('adminA', { name: 'Forklift crew', branchId: null }),
    a1: await created('adminA', { name: 'A1 night shift', branchId: f.branch.A1 }),
    a2: await created('adminA', { name: 'A2 day shift', branchId: f.branch.A2 }),
    b: await created('adminB', { name: 'B1 crew', branchId: f.branch.B1 }),
  };
}

async function add(person: Person, groupId: string, membershipIds: string[]) {
  return (await as(person)).post(`/api/v1/groups/${groupId}/members`, { membershipIds });
}
async function members(person: Person, groupId: string, query = '') {
  const res = await (await as(person)).get(`/api/v1/groups/${groupId}/members${query}`);
  expect(res.status).toBe(200);
  return GroupMemberListPage.parse(res.body);
}

describe('creating and reading groups', () => {
  it('a Tenant Admin creates a whole-organisation and a branch group, audited', async () => {
    const g = await created('adminA', { name: 'Forklift crew', branchId: null });
    expect(g).toMatchObject({
      name: 'Forklift crew',
      branch: null,
      status: 'active',
      memberCount: 0,
      canManage: true,
      version: 1,
    });
    const b = await created('adminA', { name: 'A1 night shift', branchId: f.branch.A1 });
    expect(b.branch).toMatchObject({ id: f.branch.A1, code: 'A1' });
    const events = await db.auditEvent.findMany({
      where: { action: 'group.created' },
      orderBy: { occurredAt: 'asc' },
    });
    expect(events.map((e) => [e.tenantId, e.branchId, e.entityId])).toEqual([
      [f.tenant.A, null, g.id],
      [f.tenant.A, f.branch.A1, b.id],
    ]);
  });

  it('names are unique among active groups ignoring case; an archived name can be reused', async () => {
    const g = await created('adminA', { name: 'Forklift crew', branchId: null });
    const dup = await create('adminA', { name: 'FORKLIFT CREW', branchId: f.branch.A1 });
    expect(dup.status).toBe(422);
    expect(dup.body.error.fieldErrors).toEqual([
      expect.objectContaining({ field: 'name', code: 'taken' }),
    ]);
    const admin = await as('adminA');
    expect(
      (await admin.post(`/api/v1/groups/${g.id}/archive`, { reason: 'Season over' })).status,
    ).toBe(200);
    await created('adminA', { name: 'forklift crew', branchId: null });
    // Reactivating the first while another active group holds the name.
    const back = await admin.post(`/api/v1/groups/${g.id}/reactivate`, { reason: 'Season again' });
    expect(back.status).toBe(422);
    // Same name in tenant B is fine.
    await created('adminB', { name: 'Forklift crew', branchId: null });
  });

  it('validates the body: no tenant id, no unknown fields, name bounds', async () => {
    expect((await create('adminA', { name: 'x', branchId: null })).status).toBe(422);
    const smuggled = await (
      await as('adminA')
    ).post('/api/v1/groups', {
      name: 'Smuggled',
      branchId: null,
      tenantId: f.tenant.B,
    });
    expect(smuggled.status).toBe(422);
    expect(await db.group.count()).toBe(0);
  });

  it('a group cannot be created on an inactive branch', async () => {
    await db.branch.update({
      where: { id: f.branch.A2 },
      data: { status: 'inactive', deactivatedAt: new Date(), deactivatedReason: 'Closed' },
    });
    const res = await create('adminA', { name: 'Closed branch crew', branchId: f.branch.A2 });
    expect(res.status).toBe(422);
  });

  it('a Compliance Viewer reads groups but cannot manage them; canManage is false', async () => {
    const { tenantWide } = await groups();
    const page = await list('cvA');
    expect(names(page)).toEqual(['A1 night shift', 'A2 day shift', 'Forklift crew']);
    expect(page.data.every((g) => !g.canManage)).toBe(true);
    expect((await create('cvA', { name: 'Viewer group', branchId: null })).status).toBe(403);
    const cv = await as('cvA');
    expect(
      (await cv.post(`/api/v1/groups/${tenantWide.id}/archive`, { reason: 'Nope' })).status,
    ).toBe(403);
    expect((await add('cvA', tenantWide.id, [f.member.learnerA1])).status).toBe(403);
  });

  it('learners and instructors have no group access', async () => {
    await groups();
    expect((await (await as('learnerA1')).get('/api/v1/groups')).status).toBe(403);
    expect((await (await as('insA1')).get('/api/v1/groups')).status).toBe(403);
  });

  it('an anonymous request is 401', async () => {
    expect((await request(app.getHttpServer()).get('/api/v1/groups')).status).toBe(401);
  });

  it('edits need the current version and record changed fields without the description text', async () => {
    const g = await created('adminA', { name: 'Forklift crew', branchId: null });
    const admin = await as('adminA');
    const ok = await admin.patch(`/api/v1/groups/${g.id}`, {
      version: 1,
      name: 'Forklift operators',
      description: 'Private note about the crew',
    });
    expect(ok.status).toBe(200);
    expect(GroupView.parse(ok.body)).toMatchObject({ name: 'Forklift operators', version: 2 });
    const stale = await admin.patch(`/api/v1/groups/${g.id}`, { version: 1, name: 'Again' });
    expect(stale.status).toBe(409);
    // The scope is fixed at creation.
    const move = await admin.patch(`/api/v1/groups/${g.id}`, { version: 2, branchId: f.branch.A1 });
    expect(move.status).toBe(422);
    const event = await db.auditEvent.findFirstOrThrow({ where: { action: 'group.updated' } });
    expect(JSON.stringify(event)).not.toContain('Private note');
  });
});

describe('tenant isolation', () => {
  it('tenant B cannot read, change or list tenant A groups (404, never 403)', async () => {
    const { tenantWide, a1 } = await groups();
    const b = await as('adminB');
    for (const g of [tenantWide, a1]) {
      expect((await b.get(`/api/v1/groups/${g.id}`)).status).toBe(404);
      expect((await b.get(`/api/v1/groups/${g.id}/members`)).status).toBe(404);
      expect(
        (await b.patch(`/api/v1/groups/${g.id}`, { version: 1, name: 'Mine now' })).status,
      ).toBe(404);
      expect((await b.post(`/api/v1/groups/${g.id}/archive`, { reason: 'Mine now' })).status).toBe(
        404,
      );
      expect((await add('adminB', g.id, [f.member.learnerB1])).status).toBe(404);
    }
    expect(names(await list('adminB'))).toEqual(['B1 crew']);
    expect((await list('adminB', `?branchId=${f.branch.A1}`)).data).toEqual([]);
  });

  it('a tenant B group or branch cannot be used from tenant A', async () => {
    const { b } = await groups();
    expect((await create('adminA', { name: 'On B1', branchId: f.branch.B1 })).status).toBe(404);
    expect((await (await as('adminA')).get(`/api/v1/groups/${b.id}`)).status).toBe(404);
  });

  it('a tenant A member cannot be added to a tenant B group, nor a B member to an A group', async () => {
    const { tenantWide, b } = await groups();
    expect((await add('adminA', tenantWide.id, [f.member.learnerB1])).status).toBe(404);
    expect((await add('adminB', b.id, [f.member.learnerA1])).status).toBe(404);
    // The person in both tenants: only their tenant A membership counts in tenant A.
    expect((await add('adminA', tenantWide.id, [f.member.bothB])).status).toBe(404);
    expect((await add('adminA', tenantWide.id, [f.member.bothA])).status).toBe(200);
    expect(
      await db.groupMember.count({
        where: { membershipId: { in: [f.member.learnerB1, f.member.bothB] } },
      }),
    ).toBe(0);
  });

  it('a cursor from tenant A is refused in tenant B, and from a tenant-wide caller for a branch admin', async () => {
    for (let i = 0; i < 3; i++)
      await created('adminA', { name: `Group ${i}`, branchId: f.branch.A1 });
    const page = await list('adminA', '?limit=1');
    const cursor = page.page.nextCursor!;
    expect(cursor).toBeTruthy();
    const b = await as('adminB');
    expect(
      (await b.get(`/api/v1/groups?limit=1&cursor=${encodeURIComponent(cursor)}`)).status,
    ).toBe(422);
    const ba = await as('baA1');
    expect(
      (await ba.get(`/api/v1/groups?limit=1&cursor=${encodeURIComponent(cursor)}`)).status,
    ).toBe(422);
  });
});

describe('branch scope (D-121)', () => {
  it('a Branch Admin of A1 sees only A1 groups — never whole-organisation or A2 groups', async () => {
    const { tenantWide, a1, a2 } = await groups();
    expect(names(await list('baA1'))).toEqual(['A1 night shift']);
    expect((await list('baA1', `?branchId=${f.branch.A2}`)).data).toEqual([]);
    expect((await list('baA1', '?scope=tenant')).data).toEqual([]);
    const ba = await as('baA1');
    expect((await ba.get(`/api/v1/groups/${tenantWide.id}`)).status).toBe(404);
    expect((await ba.get(`/api/v1/groups/${a2.id}`)).status).toBe(404);
    expect((await ba.get(`/api/v1/groups/${a2.id}/members`)).status).toBe(404);
    const own = GroupView.parse((await ba.get(`/api/v1/groups/${a1.id}`)).body);
    expect(own.canManage).toBe(true);
  });

  it('a Branch Admin creates groups only on its branches, never whole-organisation ones', async () => {
    await created('baA1', { name: 'A1 crew', branchId: f.branch.A1 });
    expect((await create('baA1', { name: 'A2 crew', branchId: f.branch.A2 })).status).toBe(404);
    expect((await create('baA1', { name: 'Everyone', branchId: null })).status).toBe(403);
  });

  it('a Branch Admin cannot change, archive or change members of groups outside its branches', async () => {
    const { tenantWide, a2 } = await groups();
    await add('adminA', tenantWide.id, [f.member.learnerA1]);
    const [spell] = (await members('adminA', tenantWide.id)).data;
    const ba = await as('baA1');
    for (const g of [tenantWide, a2]) {
      expect(
        (await ba.patch(`/api/v1/groups/${g.id}`, { version: 1, name: 'Taken over' })).status,
      ).toBe(404);
      expect(
        (await ba.post(`/api/v1/groups/${g.id}/archive`, { reason: 'Taken over' })).status,
      ).toBe(404);
      expect((await add('baA1', g.id, [f.member.learnerA1])).status).toBe(404);
    }
    const remove = await ba.post(`/api/v1/groups/${tenantWide.id}/members/${spell!.id}/remove`, {
      reason: 'Not mine',
    });
    expect(remove.status).toBe(404);
    expect(await db.groupMember.count({ where: { removedAt: { not: null } } })).toBe(0);
  });

  it('a Branch Admin adds only members of the group branch; one out-of-branch id refuses the whole request', async () => {
    const { a1 } = await groups();
    const mixed = await add('baA1', a1.id, [f.member.learnerA1, f.member.learnerA2]);
    expect(mixed.status).toBe(404);
    expect(await db.groupMember.count()).toBe(0);
    const ok = await add('baA1', a1.id, [f.member.learnerA1, f.member.insA1]);
    expect(ok.status).toBe(200);
    expect(AddGroupMembersResult.parse(ok.body)).toEqual({ added: 2, alreadyMembers: 0 });
  });

  it('a branch-scoped Learning Manager is held to its branch like a Branch Admin; a tenant-wide one manages all', async () => {
    const { tenantWide, a2 } = await groups();
    expect(names(await list('lmA1'))).toEqual(['A1 night shift']);
    expect((await (await as('lmA1')).get(`/api/v1/groups/${a2.id}`)).status).toBe(404);
    expect((await create('lmA1', { name: 'Everyone', branchId: null })).status).toBe(403);
    expect(names(await list('lmA'))).toEqual(['A1 night shift', 'A2 day shift', 'Forklift crew']);
    expect((await add('lmA', tenantWide.id, [f.member.learnerA2])).status).toBe(200);
  });

  it('D-125: a branch admin adds or removes only members it could manage (D-101); a tenant admin anyone', async () => {
    const { a1 } = await groups();
    // A Learning Manager of A1 is in A1 but holds a role a Branch Admin cannot grant.
    for (const ids of [[f.member.lmA1], [f.member.learnerA1, f.member.lmA1]]) {
      const res = await add('baA1', a1.id, ids);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('OUTSIDE_BRANCH_SCOPE');
    }
    expect(await db.groupMember.count()).toBe(0);
    expect((await add('lmA1', a1.id, [f.member.baA1])).status).toBe(403);
    expect((await add('adminA', a1.id, [f.member.lmA1, f.member.learnerA1])).status).toBe(200);

    const canRemove = (page: GroupMemberListPage) =>
      Object.fromEntries(page.data.map((m) => [m.membershipId, m.canRemove]));
    expect(canRemove(await members('baA1', a1.id))).toEqual({
      [f.member.lmA1]: false,
      [f.member.learnerA1]: true,
    });
    expect(canRemove(await members('adminA', a1.id))).toEqual({
      [f.member.lmA1]: true,
      [f.member.learnerA1]: true,
    });
    expect(Object.values(canRemove(await members('cvA1', a1.id)))).toEqual([false, false]);

    const spell = (await members('adminA', a1.id)).data.find(
      (m) => m.membershipId === f.member.lmA1,
    )!;
    const refused = await (
      await as('baA1')
    ).post(`/api/v1/groups/${a1.id}/members/${spell.id}/remove`, { reason: 'Not on this crew' });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('OUTSIDE_BRANCH_SCOPE');
    expect(await db.groupMember.count({ where: { removedAt: null } })).toBe(2);
    const ok = await (
      await as('adminA')
    ).post(`/api/v1/groups/${a1.id}/members/${spell.id}/remove`, { reason: 'Not on this crew' });
    expect(ok.status).toBe(200);
    expect(GroupMemberView.parse(ok.body).canRemove).toBe(false);
  });

  it('a branch-scoped Compliance Viewer reads only its branch groups', async () => {
    await groups();
    expect(names(await list('cvA1'))).toEqual(['A1 night shift']);
  });
});

describe('members and history (D-120)', () => {
  it('adding is idempotent; a whole-organisation group takes any member; a branch group only its branch', async () => {
    const { tenantWide, a1 } = await groups();
    const first = await add('adminA', tenantWide.id, [f.member.learnerA1, f.member.learnerA2]);
    expect(AddGroupMembersResult.parse(first.body)).toEqual({ added: 2, alreadyMembers: 0 });
    const again = await add('adminA', tenantWide.id, [f.member.learnerA1, f.member.learnerA1]);
    expect(AddGroupMembersResult.parse(again.body)).toEqual({ added: 0, alreadyMembers: 1 });
    expect((await add('adminA', a1.id, [f.member.learnerA2])).status).toBe(404);
    const view = GroupView.parse(
      (await (await as('adminA')).get(`/api/v1/groups/${tenantWide.id}`)).body,
    );
    expect(view.memberCount).toBe(2);
    expect(await db.auditEvent.count({ where: { action: 'group.member_added' } })).toBe(2);
  });

  it('removing keeps the spell with when, who and why; re-adding starts a new spell', async () => {
    const { a1 } = await groups();
    await add('baA1', a1.id, [f.member.learnerA1]);
    const [spell] = (await members('baA1', a1.id)).data;
    const ba = await as('baA1');
    const removed = await ba.post(`/api/v1/groups/${a1.id}/members/${spell!.id}/remove`, {
      reason: 'Moved to days',
    });
    expect(removed.status).toBe(200);
    expect(GroupMemberView.parse(removed.body)).toMatchObject({
      removedReason: 'Moved to days',
      displayName: expect.any(String),
    });
    const twice = await ba.post(`/api/v1/groups/${a1.id}/members/${spell!.id}/remove`, {
      reason: 'Again',
    });
    expect(twice.status).toBe(409);
    expect((await members('baA1', a1.id)).data).toEqual([]);
    const history = (await members('baA1', a1.id, '?state=removed')).data;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      membershipId: f.member.learnerA1,
      removedReason: 'Moved to days',
    });

    await add('baA1', a1.id, [f.member.learnerA1]);
    const rows = await db.groupMember.findMany({ where: { groupId: a1.id } });
    expect(rows).toHaveLength(2);
    const row = rows.find((r) => r.removedAt)!;
    expect(row).toMatchObject({ removedById: f.user.baA1, removedReason: 'Moved to days' });
    const event = await db.auditEvent.findFirstOrThrow({
      where: { action: 'group.member_removed' },
    });
    expect(event).toMatchObject({
      tenantId: f.tenant.A,
      branchId: f.branch.A1,
      reason: 'Moved to days',
    });
  });

  it('a spell id from another group is a 404', async () => {
    const { tenantWide, a1 } = await groups();
    await add('adminA', tenantWide.id, [f.member.learnerA1]);
    const [spell] = (await members('adminA', tenantWide.id)).data;
    const res = await (
      await as('baA1')
    ).post(`/api/v1/groups/${a1.id}/members/${spell!.id}/remove`, {
      reason: 'Wrong group',
    });
    expect(res.status).toBe(404);
  });

  it('a deactivated member stays listed as deactivated and cannot be added again', async () => {
    const { tenantWide, a1 } = await groups();
    await add('adminA', tenantWide.id, [f.member.learnerA1]);
    const admin = await as('adminA');
    const off = await admin.post(`/api/v1/people/${f.member.learnerA1}/deactivate`, {
      reason: 'Left the company',
    });
    expect(off.status).toBe(200);
    const [row] = (await members('adminA', tenantWide.id)).data;
    expect(row).toMatchObject({
      membershipId: f.member.learnerA1,
      memberStatus: 'deactivated',
      removedAt: null,
    });
    const again = await add('adminA', a1.id, [f.member.learnerA1]);
    expect(again.status).toBe(422);
  });

  it('an archived group keeps its history, takes no new members, and can be reactivated', async () => {
    const { a1 } = await groups();
    await add('adminA', a1.id, [f.member.learnerA1]);
    const admin = await as('adminA');
    const archived = await admin.post(`/api/v1/groups/${a1.id}/archive`, { reason: 'Shift ended' });
    expect(GroupView.parse(archived.body)).toMatchObject({
      status: 'archived',
      archivedReason: 'Shift ended',
    });
    expect((await admin.post(`/api/v1/groups/${a1.id}/archive`, { reason: 'Again' })).status).toBe(
      409,
    );
    const late = await add('adminA', a1.id, [f.member.insA1]);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('GROUP_ARCHIVED');
    expect((await members('adminA', a1.id)).data).toHaveLength(1);
    expect(names(await list('adminA', '?status=archived'))).toEqual(['A1 night shift']);
    const back = await admin.post(`/api/v1/groups/${a1.id}/reactivate`, {
      reason: 'Shift resumed',
    });
    expect(GroupView.parse(back.body)).toMatchObject({ status: 'active', archivedAt: null });
    const actions = await db.auditEvent.findMany({
      where: { entityId: a1.id, action: { in: ['group.archived', 'group.reactivated'] } },
      orderBy: { occurredAt: 'asc' },
    });
    expect(actions.map((a) => [a.action, a.reason])).toEqual([
      ['group.archived', 'Shift ended'],
      ['group.reactivated', 'Shift resumed'],
    ]);
  });

  it('leaving a branch ends that branch’s group spells with "Left the branch", not the others', async () => {
    const { tenantWide, a1 } = await groups();
    const admin = await as('adminA');
    // learnerA2 also joins branch A1 (no role there), then is added to the A1 and the whole-organisation group.
    expect(
      (await admin.post(`/api/v1/people/${f.member.learnerA2}/branches`, { branchId: f.branch.A1 }))
        .status,
    ).toBe(200);
    await add('adminA', a1.id, [f.member.learnerA2]);
    await add('adminA', tenantWide.id, [f.member.learnerA2]);
    const left = await admin.post(
      `/api/v1/people/${f.member.learnerA2}/branches/${f.branch.A1}/remove`,
    );
    expect(left.status).toBe(204);
    const spells = await db.groupMember.findMany({ where: { membershipId: f.member.learnerA2 } });
    expect(spells.find((s) => s.groupId === a1.id)).toMatchObject({
      removedReason: LEFT_BRANCH_REASON,
      removedById: f.user.adminA,
    });
    expect(spells.find((s) => s.groupId === tenantWide.id)?.removedAt).toBeNull();
    const event = await db.auditEvent.findFirstOrThrow({
      where: { action: 'group.member_removed' },
    });
    expect(event).toMatchObject({
      entityId: a1.id,
      reason: LEFT_BRANCH_REASON,
      branchId: f.branch.A1,
    });
  });

  it('searches members by name or address within the group only', async () => {
    const { tenantWide } = await groups();
    await add('adminA', tenantWide.id, [f.member.learnerA1, f.member.learnerA2]);
    const page = await members(
      'adminA',
      tenantWide.id,
      `?search=${encodeURIComponent('learnera2')}`,
    );
    expect(page.data.map((m) => m.membershipId)).toEqual([f.member.learnerA2]);
  });
});

describe('database rules', () => {
  it('groups and spells are never deleted; a removal is final; scope and identity never change', async () => {
    const { tenantWide, a1 } = await groups();
    await add('adminA', a1.id, [f.member.learnerA1]);
    const spell = await db.groupMember.findFirstOrThrow({ where: { groupId: a1.id } });
    await expect(db.group.delete({ where: { id: a1.id } })).rejects.toThrow();
    await expect(db.groupMember.delete({ where: { id: spell.id } })).rejects.toThrow();
    await expect(
      db.group.update({ where: { id: tenantWide.id }, data: { branchId: f.branch.A1 } }),
    ).rejects.toThrow();
    await expect(
      db.groupMember.update({ where: { id: spell.id }, data: { membershipId: f.member.insA1 } }),
    ).rejects.toThrow();
    await db.groupMember.update({
      where: { id: spell.id },
      data: { removedAt: new Date(), removedById: f.user.adminA, removedReason: 'Done' },
    });
    await expect(
      db.groupMember.update({
        where: { id: spell.id },
        data: { removedAt: null, removedById: null, removedReason: null },
      }),
    ).rejects.toThrow();
  });

  it('refuses a branch group member outside the branch, a second current spell, and a cross-tenant link', async () => {
    const { tenantWide, a1, b } = await groups();
    const base = { tenantId: f.tenant.A, addedById: f.user.adminA };
    await expect(
      db.groupMember.create({
        data: { ...base, groupId: a1.id, membershipId: f.member.learnerA2 },
      }),
    ).rejects.toThrow();
    await db.groupMember.create({
      data: { ...base, groupId: tenantWide.id, membershipId: f.member.learnerA1 },
    });
    await expect(
      db.groupMember.create({
        data: { ...base, groupId: tenantWide.id, membershipId: f.member.learnerA1 },
      }),
    ).rejects.toThrow();
    await expect(
      db.groupMember.create({ data: { ...base, groupId: b.id, membershipId: f.member.learnerA1 } }),
    ).rejects.toThrow();
    await expect(
      db.groupMember.create({
        data: { ...base, groupId: tenantWide.id, membershipId: f.member.learnerB1 },
      }),
    ).rejects.toThrow();
  });

  it('a branch membership is not removed while a current spell in that branch’s groups exists', async () => {
    const { a1 } = await groups();
    await add('adminA', a1.id, [f.member.learnerA1]);
    await expect(
      db.membershipBranch.deleteMany({
        where: { membershipId: f.member.learnerA1, branchId: f.branch.A1 },
      }),
    ).rejects.toThrow();
  });
});

describe('invitations into a group (D-122)', () => {
  const fresh = () => `group-invitee-${Date.now().toString(36)}-${++seq}@example.test`;

  async function invite(person: Person, body: object) {
    return (await as(person)).post('/api/v1/invitations', body);
  }

  /** Accepts as a new account: the test sets a known token on the row (the email path is covered by 3.1 tests). */
  async function acceptAsNew(invitationId: string) {
    const token = randomBytes(32).toString('base64url');
    await db.invitation.update({
      where: { id: invitationId },
      data: { tokenHash: hashSessionToken(token) },
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .set('origin', WEB)
      .send({ token, displayName: 'Meera Iyer (Demo)', password: 'a long and private passphrase' });
    expect(res.status).toBe(201);
    return res.body as { membershipId: string };
  }

  it('an accepted invitation adds the person to the group, audited with the inviter as actor', async () => {
    const { a1 } = await groups();
    const res = await invite('baA1', {
      email: fresh(),
      role: 'learner',
      branchId: f.branch.A1,
      groupId: a1.id,
    });
    expect(res.status).toBe(201);
    const view = InvitationView.parse(res.body);
    expect(view.group).toEqual({ id: a1.id, name: 'A1 night shift' });
    const { membershipId } = await acceptAsNew(view.id);
    const spell = await db.groupMember.findFirstOrThrow({ where: { groupId: a1.id } });
    expect(spell).toMatchObject({ membershipId, addedById: f.user.baA1, removedAt: null });
    const event = await db.auditEvent.findFirstOrThrow({ where: { action: 'group.member_added' } });
    expect(event).toMatchObject({
      actorUserId: f.user.baA1,
      entityId: a1.id,
      reason: 'Invitation accepted',
    });
  });

  it('refuses a group the inviter cannot manage, another tenant’s group, a mismatched branch or an archived group', async () => {
    const { tenantWide, a1, a2, b } = await groups();
    const email = fresh();
    // A Branch Admin never sees whole-organisation or other-branch groups.
    expect(
      (
        await invite('baA1', {
          email,
          role: 'learner',
          branchId: f.branch.A1,
          groupId: tenantWide.id,
        })
      ).status,
    ).toBe(404);
    expect(
      (await invite('baA1', { email, role: 'learner', branchId: f.branch.A1, groupId: a2.id }))
        .status,
    ).toBe(404);
    expect(
      (await invite('adminA', { email, role: 'learner', branchId: f.branch.A1, groupId: b.id }))
        .status,
    ).toBe(404);
    const mismatch = await invite('adminA', {
      email,
      role: 'learner',
      branchId: f.branch.A2,
      groupId: a1.id,
    });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.error.fieldErrors[0]).toMatchObject({
      field: 'groupId',
      code: 'branch_mismatch',
    });
    const tenantWideInvite = await invite('adminA', {
      email,
      role: 'learner',
      branchId: null,
      groupId: a1.id,
    });
    expect(tenantWideInvite.status).toBe(422);
    await (await as('adminA')).post(`/api/v1/groups/${a2.id}/archive`, { reason: 'Closed' });
    const archived = await invite('adminA', {
      email,
      role: 'learner',
      branchId: f.branch.A2,
      groupId: a2.id,
    });
    expect(archived.status).toBe(422);
    expect(await db.invitation.count()).toBe(0);
  });

  it('a group archived before acceptance: the person joins without it', async () => {
    const { tenantWide } = await groups();
    const res = await invite('adminA', {
      email: fresh(),
      role: 'learner',
      branchId: f.branch.A2,
      groupId: tenantWide.id,
    });
    expect(res.status).toBe(201);
    await (
      await as('adminA')
    ).post(`/api/v1/groups/${tenantWide.id}/archive`, { reason: 'Closed' });
    const { membershipId } = await acceptAsNew(res.body.id);
    expect(membershipId).toBeTruthy();
    expect(await db.groupMember.count()).toBe(0);
  });

  it('the invitation’s group never changes while pending', async () => {
    const { tenantWide, a1 } = await groups();
    const res = await invite('adminA', {
      email: fresh(),
      role: 'learner',
      branchId: f.branch.A1,
      groupId: a1.id,
    });
    await expect(
      db.invitation.update({ where: { id: res.body.id }, data: { groupId: tenantWide.id } }),
    ).rejects.toThrow();
  });
});

describe('review fixes (isolation audit and security review 3.2)', () => {
  it('a branch admin listing invitations does not see a whole-organisation group’s name', async () => {
    const { tenantWide, a1 } = await groups();
    const admin = await as('adminA');
    const toTenantGroup = await admin.post('/api/v1/invitations', {
      email: `masked-${++seq}@example.test`,
      role: 'learner',
      branchId: f.branch.A1,
      groupId: tenantWide.id,
    });
    expect(toTenantGroup.status).toBe(201);
    const toBranchGroup = await admin.post('/api/v1/invitations', {
      email: `shown-${++seq}@example.test`,
      role: 'learner',
      branchId: f.branch.A1,
      groupId: a1.id,
    });
    expect(toBranchGroup.status).toBe(201);
    const res = await (await as('baA1')).get('/api/v1/invitations');
    const rows = res.body.data as InvitationView[];
    expect(rows.find((r) => r.id === toTenantGroup.body.id)?.group).toBeNull();
    expect(rows.find((r) => r.id === toBranchGroup.body.id)?.group).toEqual({
      id: a1.id,
      name: a1.name,
    });
    expect(JSON.stringify(res.body)).not.toContain(tenantWide.name);
  });

  it('a support session reads the audit log without group names, and cannot open groups', async () => {
    const { tenantWide } = await groups();
    const staff = await actors.signIn(emailOf('staff'));
    const started = await staff.post('/api/v1/platform/support-sessions', {
      tenantId: f.tenant.A,
      reason: 'Ticket 12: checking groups',
    });
    expect(started.status).toBe(201);
    expect((await staff.get('/api/v1/groups')).status).toBe(403);
    expect((await staff.get(`/api/v1/groups/${tenantWide.id}`)).status).toBe(403);
    const log = await staff.get('/api/v1/audit-events?limit=100');
    expect(log.status).toBe(200);
    const created = (log.body.data as { action: string; entityLabel: string | null }[]).filter(
      (e) => e.action === 'group.created',
    );
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((e) => e.entityLabel === null)).toBe(true);
  });

  it('a skipped group on acceptance is recorded with a reason code (D-123)', async () => {
    const { tenantWide } = await groups();
    const admin = await as('adminA');
    const res = await admin.post('/api/v1/invitations', {
      email: `skipped-${++seq}@example.test`,
      role: 'learner',
      branchId: f.branch.A2,
      groupId: tenantWide.id,
    });
    await admin.post(`/api/v1/groups/${tenantWide.id}/archive`, { reason: 'Closed' });
    const token = randomBytes(32).toString('base64url');
    await db.invitation.update({
      where: { id: res.body.id },
      data: { tokenHash: hashSessionToken(token) },
    });
    const accepted = await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .set('origin', WEB)
      .send({ token, displayName: 'Meera Iyer (Demo)', password: 'a long and private passphrase' });
    expect(accepted.status).toBe(201);
    const event = await db.auditEvent.findFirstOrThrow({
      where: { action: 'invitation.group_skipped' },
    });
    expect(event).toMatchObject({
      entityId: res.body.id,
      actorUserId: f.user.adminA,
      tenantId: f.tenant.A,
    });
    expect(event.after).toEqual({ groupId: tenantWide.id, why: 'group_unavailable' });
  });

  it('a member-list cursor from one group is refused on another, and from a tenant-wide caller for a branch admin', async () => {
    const { a1 } = await groups();
    const other = await created('adminA', { name: 'A1 day shift', branchId: f.branch.A1 });
    await add('adminA', a1.id, [f.member.learnerA1, f.member.insA1]);
    const cursor = (await members('adminA', a1.id, '?limit=1')).page.nextCursor!;
    expect(cursor).toBeTruthy();
    const q = `?limit=1&cursor=${encodeURIComponent(cursor)}`;
    expect((await (await as('adminA')).get(`/api/v1/groups/${other.id}/members${q}`)).status).toBe(
      422,
    );
    expect((await (await as('baA1')).get(`/api/v1/groups/${a1.id}/members${q}`)).status).toBe(422);
  });

  it('no one is added to a group whose branch is inactive', async () => {
    const { a2 } = await groups();
    await db.branch.update({
      where: { id: f.branch.A2 },
      data: { status: 'inactive', deactivatedAt: new Date(), deactivatedReason: 'Closed' },
    });
    const res = await add('adminA', a2.id, [f.member.learnerA2]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BRANCH_INACTIVE');
    expect(await db.groupMember.count()).toBe(0);
  });

  it('a branch admin whose role was revoked after signing in cannot change groups (live reach)', async () => {
    const { a1 } = await groups();
    const ba = await as('baA1');
    await db.roleAssignment.updateMany({
      where: { membershipId: f.member.baA1, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: f.user.adminA, revokedReason: 'Moved on' },
    });
    const res = await ba.post(`/api/v1/groups/${a1.id}/members`, {
      membershipIds: [f.member.learnerA1],
    });
    expect([403, 404]).toContain(res.status);
    expect(await db.groupMember.count()).toBe(0);
  });
});
