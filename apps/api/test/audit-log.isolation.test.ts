import type { INestApplication } from '@nestjs/common';
import { AuditEventListPage } from '@vachelearn/contracts';
import type { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../src/auth/passwords';
import { createTestApp } from './app';
import { resetDatabase, testPrisma } from './db';
import { OPERATOR, realActors, TEST_PASSWORD } from './sessions';

/*
 * The tenant audit log (Slice 2.6a; D-099, D-109) through real sessions. Fixture: tenant A (A1, A2) with a Tenant
 * Admin, a Branch Admin of A1, a whole-tenant Compliance Viewer, a Learning Manager and members on A1 and A2; tenant B
 * (B1) with its own admin; a platform staff member.
 */

let app: INestApplication;
let db: PrismaClient;
let actors: ReturnType<typeof realActors>;
let tenantA: string;
let tenantB: string;
let A1: string;
let A2: string;
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
  const B1 = await branch(tenantB, 'B1');
  const { user, grant } = actors;
  m.adminA = (
    await grant(await user('admin-a@example.test'), tenantA, 'tenant_admin')
  ).membershipId;
  m.baA1 = (
    await grant(await user('ba-a1@example.test'), tenantA, 'branch_admin', A1)
  ).membershipId;
  m.cvA = (await grant(await user('cv-a@example.test'), tenantA, 'compliance_viewer')).membershipId;
  m.lmA = (await grant(await user('lm-a@example.test'), tenantA, 'learning_manager')).membershipId;
  m.memberA1 = (
    await grant(await user('member-a1@example.test'), tenantA, 'learner', A1)
  ).membershipId;
  m.memberA2 = (
    await grant(await user('member-a2@example.test'), tenantA, 'learner', A2)
  ).membershipId;
  m.adminB = (
    await grant(await user('admin-b@example.test'), tenantB, 'tenant_admin')
  ).membershipId;
  await grant(await user('member-b1@example.test'), tenantB, 'learner', B1);
  const staff = await user('psa@example.test');
  await actors
    .memberships()
    .operatorGrantPlatformRole({ userId: staff, role: 'platform_super_admin' }, OPERATOR);
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

type Session = Awaited<ReturnType<typeof actors.signIn>>;
const read = async (s: Session, query = '') => {
  const res = await s.get(`/api/v1/audit-events${query}`);
  expect(res.status).toBe(200);
  return AuditEventListPage.parse(res.body);
};
const all = async (s: Session, query = '') => {
  const events: AuditEventListPage['data'] = [];
  let cursor: string | null = null;
  do {
    const page: AuditEventListPage = await read(
      s,
      `?limit=100${query}${cursor ? `&cursor=${cursor}` : ''}`,
    );
    events.push(...page.data);
    cursor = page.page.nextCursor;
  } while (cursor);
  return events;
};

describe('tenant audit log', () => {
  it('a Tenant Admin reads its own tenant’s events, newest first, never another tenant’s', async () => {
    const admin = await actors.signIn('admin-a@example.test');
    await admin.post(`/api/v1/people/${m.memberA1}/deactivate`, { reason: 'Left the site' });
    const events = await all(admin);
    expect(events.length).toBeGreaterThan(5);
    expect(events[0]!.action).toBe('membership.deactivated');
    expect(events[0]!).toMatchObject({
      entityId: m.memberA1,
      reason: 'Left the site',
      actor: { kind: 'user', displayName: 'admin-a@example.test (Demo)' },
    });
    const times = events.map((e) => e.occurredAt);
    expect(times).toEqual([...times].sort().reverse());
    const bEvents = await db.auditEvent.findMany({
      where: { tenantId: tenantB },
      select: { id: true },
    });
    expect(events.some((e) => bEvents.some((b) => b.id === e.id))).toBe(false);
    // Operator commands (no acting user) are shown as the system.
    expect(events.some((e) => e.actor.kind === 'system')).toBe(true);
  });

  it('branch admin of A1 sees only events tagged with A1 (D-109)', async () => {
    const ba = await actors.signIn('ba-a1@example.test');
    const events = await all(ba);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.branch?.id === A1)).toBe(true);
    const rows = await db.auditEvent.findMany({ where: { tenantId: tenantA, branchId: A1 } });
    expect(events).toHaveLength(rows.length);
  });

  it('a cursor cannot be carried to another scope or tenant; the action filter narrows', async () => {
    const admin = await actors.signIn('admin-a@example.test');
    const first = await read(admin, '?limit=1');
    expect(first.page.nextCursor).not.toBeNull();
    for (const email of ['ba-a1@example.test', 'admin-b@example.test']) {
      const s = await actors.signIn(email);
      expect(
        (await s.get(`/api/v1/audit-events?limit=1&cursor=${first.page.nextCursor}`)).status,
      ).toBe(422);
    }
    const assigned = await all(admin, '&action=role.assigned');
    expect(assigned.length).toBeGreaterThan(0);
    expect(assigned.every((e) => e.action === 'role.assigned')).toBe(true);
    expect((await admin.get('/api/v1/audit-events?tenantId=x')).status).toBe(422);
  });

  it('a whole-tenant Compliance Viewer reads everything; a Learning Manager and a Learner cannot', async () => {
    const cv = await actors.signIn('cv-a@example.test');
    expect((await all(cv)).some((e) => e.branch === null)).toBe(true);
    for (const email of ['lm-a@example.test', 'member-a1@example.test']) {
      const s = await actors.signIn(email);
      expect((await s.get('/api/v1/audit-events')).status).toBe(403);
    }
  });

  it('support sessions: named as VacheLearn support with the reason, never the email; record views are audited (D-099)', async () => {
    const staff = await actors.signIn('psa@example.test');
    const started = await staff.post('/api/v1/platform/support-sessions', {
      tenantId: tenantA,
      reason: 'Ticket 77: checking a member',
    });
    expect(started.status).toBe(201);
    expect((await staff.get(`/api/v1/people/${m.memberA1}`)).status).toBe(200);
    expect((await staff.get(`/api/v1/branches/${A2}`)).status).toBe(200);
    // Another tenant's id is a 404 inside support too, and nothing is recorded as viewed.
    expect((await staff.get(`/api/v1/people/${m.adminB}`)).status).toBe(404);

    const viewed = await db.auditEvent.findMany({ where: { action: 'support.viewed' } });
    expect(viewed.map((e) => [e.entityType, e.entityId]).sort()).toEqual(
      [
        ['branch', A2],
        ['membership', m.memberA1],
      ].sort(),
    );

    const admin = await actors.signIn('admin-a@example.test');
    const res = await admin.get('/api/v1/audit-events?support=true&limit=100');
    const support = AuditEventListPage.parse(res.body).data;
    expect(support.length).toBeGreaterThanOrEqual(3);
    for (const event of support) {
      expect(event.actor).toEqual({
        kind: 'support',
        displayName: 'psa@example.test (Demo)',
        reason: 'Ticket 77: checking a member',
      });
    }
    expect(JSON.stringify(res.body)).not.toContain('psa@example.test"');
    expect(JSON.stringify(res.body)).not.toMatch(/"email"/);
    // The staff member reads the tenant's audit log in support too (SS), without seeing B.
    const own = await all(staff);
    expect(own.length).toBeGreaterThan(0);
    expect(
      await db.auditEvent.count({ where: { action: 'support.viewed', tenantId: tenantB } }),
    ).toBe(0);
  });

  describe('review fixes 2.6a', () => {
    it('names records in words and hides deactivation reasons from readers who may not deactivate (D-106)', async () => {
      const admin = await actors.signIn('admin-a@example.test');
      await admin.post(`/api/v1/people/${m.memberA1}/deactivate`, { reason: 'Sensitive note' });
      const [event] = await all(admin, '&action=membership.deactivated');
      expect(event).toMatchObject({
        entityLabel: 'member-a1@example.test (Demo)',
        reason: 'Sensitive note',
      });
      const cv = await actors.signIn('cv-a@example.test');
      const [seen] = await all(cv, '&action=membership.deactivated');
      expect(seen!.reason).toBeNull();
      const staff = await actors.signIn('psa@example.test');
      await staff.post('/api/v1/platform/support-sessions', {
        tenantId: tenantA,
        reason: 'Ticket 9: audit',
      });
      const [inSupport] = await all(staff, '&action=membership.deactivated');
      expect(inSupport!.reason).toBeNull();
    });

    it('only the session’s own staff member is named as support; anyone else ending it is not', async () => {
      const staff = await actors.signIn('psa@example.test');
      const started = await staff.post('/api/v1/platform/support-sessions', {
        tenantId: tenantB,
        reason: 'Ticket 10: B',
      });
      const adminAUser = (await db.membership.findUniqueOrThrow({ where: { id: m.adminA } }))
        .userId;
      // As written when tenant A's admin ends a browser session that carried a support session into B.
      await db.auditEvent.create({
        data: {
          actorUserId: adminAUser,
          tenantId: tenantB,
          action: 'support_session.ended',
          entityType: 'support_session',
          entityId: String(started.body.id),
          supportSessionId: String(started.body.id),
          reason: 'signed_out',
        },
      });
      const adminB = await actors.signIn('admin-b@example.test');
      const [ended] = await all(adminB, '&action=support_session.ended');
      expect(ended!.actor).toEqual({ kind: 'system' });
      expect(JSON.stringify(ended)).not.toContain('admin-a@example.test');
    });

    it('a tenant switch records no membership id of the organisation switched from', async () => {
      const both = await actors.user('both@example.test');
      const inA = (await actors.grant(both, tenantA, 'learner')).membershipId;
      const inB = (await actors.grant(both, tenantB, 'learner')).membershipId;
      const s = await actors.signIn('both@example.test');
      expect((await s.post('/api/v1/auth/session/tenant', { membershipId: inB })).status).toBe(200);
      expect((await s.post('/api/v1/auth/session/tenant', { membershipId: inA })).status).toBe(200);
      const admin = await actors.signIn('admin-a@example.test');
      const res = await admin.get('/api/v1/audit-events?limit=100');
      expect(JSON.stringify(res.body)).not.toContain(inB);
    });

    it('branch admin of A1 sees another branch’s id masked in a primary-branch move', async () => {
      const admin = await actors.signIn('admin-a@example.test');
      // memberA2 joins A1, then A1 becomes primary (moved from A2).
      await admin.post(`/api/v1/people/${m.memberA2}/branches`, { branchId: A1 });
      await admin.post(`/api/v1/people/${m.memberA2}/primary-branch`, { branchId: A1 });
      const ba = await actors.signIn('ba-a1@example.test');
      const moved = (await all(ba, '&action=membership.primary_branch_set')).find(
        (e) => e.entityId === m.memberA2 && e.after?.primaryBranchId === A1,
      );
      expect(moved!.before).toEqual({ primaryBranchId: '[other branch]' });
      expect(JSON.stringify(await all(ba))).not.toContain(A2);
    });

    it('support=false leaves support rows out; a member’s own reads record no support view', async () => {
      const admin = await actors.signIn('admin-a@example.test');
      expect((await admin.get(`/api/v1/people/${m.memberA1}`)).status).toBe(200);
      expect(await db.auditEvent.count({ where: { action: 'support.viewed' } })).toBe(0);
      const staff = await actors.signIn('psa@example.test');
      await staff.post('/api/v1/platform/support-sessions', {
        tenantId: tenantA,
        reason: 'Ticket 11',
      });
      await staff.get(`/api/v1/people/${m.memberA1}`);
      const plain = await all(admin, '&support=false');
      expect(plain.some((e) => e.actor.kind === 'support')).toBe(false);
      // A cursor from the same reader with another filter is refused.
      const first = await read(admin, '?limit=1');
      expect(
        (
          await admin.get(
            `/api/v1/audit-events?limit=1&support=false&cursor=${first.page.nextCursor}`,
          )
        ).status,
      ).toBe(422);
    });
  });
});
