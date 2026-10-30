import type { INestApplication } from '@nestjs/common';
import {
  CurrentSupportSession,
  SessionContextView,
  SupportSessionView,
} from '@vachelearn/contracts';
import type { PrismaClient } from '../generated/prisma/client';
import { SUPPORT_PERMISSIONS } from '../src/access/permissions';
import { GRANTS } from '../src/access/role-grants';
import { SupportSessionsService } from '../src/access/support-sessions.service';
import { SessionsService } from '../src/auth/sessions.service';
import { hashPassword } from '../src/auth/passwords';
import { createTestApp } from './app';
import { resetDatabase, testPrisma } from './db';
import { OPERATOR, realActors, TEST_PASSWORD } from './sessions';

/*
 * Platform support sessions (Slice 2.4c; D-037, D-098) through real sessions: platform staff reach a tenant only inside
 * one — explicit, with a reason, read-only (the matrix's SS permissions), 60 minutes at most, bound to the browser
 * session that opened it — and every request inside is audited with the session id.
 */

let app: INestApplication;
let db: PrismaClient;
let actors: ReturnType<typeof realActors>;
let tenantA: string;
let tenantB: string;
let A1: string;
let staffId: string;

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
  A1 = (
    await db.branch.create({
      data: { tenantId: tenantA, code: 'A1', name: 'Branch A1', timezone: 'Asia/Kolkata' },
    })
  ).id;
  staffId = await actors.user('psa@example.test');
  await actors
    .memberships()
    .operatorGrantPlatformRole({ userId: staffId, role: 'platform_super_admin' }, OPERATOR);
  await actors.grant(await actors.user('admin-a@example.test'), tenantA, 'tenant_admin');
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

async function staffInSupport(tenantId = tenantA) {
  const s = await actors.signIn('psa@example.test');
  const res = await s.post('/api/v1/platform/support-sessions', {
    tenantId,
    reason: 'Ticket 4521: missing report',
  });
  expect(res.status).toBe(201);
  return { s, view: SupportSessionView.parse(res.body) };
}

describe('support permissions', () => {
  it('are exactly the SS cells of the matrix, all reads', () => {
    expect([...SUPPORT_PERMISSIONS].sort()).toEqual(
      Object.entries(GRANTS)
        .filter(([, cells]) => cells.PSA === 'SS')
        .map(([key]) => key)
        .sort(),
    );
    expect(SUPPORT_PERMISSIONS.every((k) => /\.(read|review)$/.test(k))).toBe(true);
  });
});

describe('without a support session', () => {
  it('platform staff have no tenant access at all', async () => {
    const s = await actors.signIn('psa@example.test');
    expect((await s.get('/api/v1/branches')).status).toBe(403);
  });
});

describe('inside a support session (D-037)', () => {
  it('reads the tenant with SS permissions; every request is audited with the session id and the tenant', async () => {
    const { s, view } = await staffInSupport();
    expect(view).toMatchObject({
      tenant: { id: tenantA, slug: 'tenant-a' },
      reason: 'Ticket 4521: missing report',
    });
    expect(new Date(view.expiresAt).getTime() - new Date(view.startedAt).getTime()).toBe(
      60 * 60_000,
    );
    const list = await s.get('/api/v1/branches');
    expect(list.status).toBe(200);
    expect(list.body.data.map((b: { id: string }) => b.id)).toEqual([A1]);

    const started = await db.auditEvent.findFirstOrThrow({
      where: { action: 'support_session.started' },
    });
    expect(started).toMatchObject({
      tenantId: tenantA,
      supportSessionId: view.id,
      actorUserId: staffId,
    });
    const accessed = await db.auditEvent.findMany({ where: { action: 'support.accessed' } });
    expect(accessed).toHaveLength(1);
    expect(accessed[0]).toMatchObject({ tenantId: tenantA, supportSessionId: view.id });
    expect(accessed[0]!.after).toEqual({
      method: 'GET',
      route: 'BranchesController.list',
      permission: 'branch.read',
    });

    const current = CurrentSupportSession.parse(
      (await s.get('/api/v1/platform/support-sessions/current')).body,
    );
    expect(current.data?.id).toBe(view.id);
  });

  it('is read-only: changes are refused even where the matrix grants the read, and permissions outside SS are 403', async () => {
    const { s } = await staffInSupport();
    const create = await s.post('/api/v1/branches', {
      code: 'A9',
      name: 'New',
      timezone: 'Asia/Kolkata',
    });
    expect(create.status).toBe(403);
    expect(await db.branch.count({ where: { code: 'A9' } })).toBe(0);
    const member = await db.membership.findFirstOrThrow({ where: { tenantId: tenantA } });
    expect((await s.get(`/api/v1/role-assignments?membershipId=${member.id}`)).status).toBe(403);
    expect(
      (await s.post(`/api/v1/branches/${A1}/deactivate`, { reason: 'Support should not' })).body
        .error.code,
    ).toBe('SUPPORT_READ_ONLY');
  });

  it('reaches only its tenant: another tenant’s branch is 404', async () => {
    const B1 = (
      await db.branch.create({
        data: { tenantId: tenantB, code: 'B1', name: 'Branch B1', timezone: 'Asia/Kolkata' },
      })
    ).id;
    const { s } = await staffInSupport();
    expect((await s.get(`/api/v1/branches/${B1}`)).status).toBe(404);
  });

  it('applies only to the browser session that opened it', async () => {
    await staffInSupport();
    const other = await actors.signIn('psa@example.test');
    expect((await other.get('/api/v1/branches')).status).toBe(403);
  });
});

describe('it ends', () => {
  it('when ended: the next request has no tenant access; ended is audited', async () => {
    const { s, view } = await staffInSupport();
    expect((await s.post(`/api/v1/platform/support-sessions/${view.id}/end`)).status).toBe(204);
    expect((await s.get('/api/v1/branches')).status).toBe(403);
    expect(
      await db.auditEvent.count({
        where: { action: 'support_session.ended', supportSessionId: view.id },
      }),
    ).toBe(1);
    expect(
      CurrentSupportSession.parse((await s.get('/api/v1/platform/support-sessions/current')).body)
        .data,
    ).toBeNull();
  });

  it('after 60 minutes (expired, audited)', async () => {
    const { s, view } = await staffInSupport();
    const past = new Date(Date.now() - 61 * 60_000);
    await db.platformSupportSession.update({
      where: { id: view.id },
      data: { startedAt: past, expiresAt: new Date(past.getTime() + 60 * 60_000) },
    });
    expect((await s.get('/api/v1/branches')).status).toBe(403);
    expect(
      await db.platformSupportSession.findUniqueOrThrow({ where: { id: view.id } }),
    ).toMatchObject({
      endReason: 'expired',
    });
    expect(await db.auditEvent.count({ where: { action: 'support_session.expired' } })).toBe(1);
  });

  it('on sign-out, when the tenant is archived, or when the staff member loses the platform role', async () => {
    const first = await staffInSupport();
    await first.s.post('/api/v1/auth/logout');
    expect(
      await db.platformSupportSession.findUniqueOrThrow({ where: { id: first.view.id } }),
    ).toMatchObject({
      endReason: 'signed_out',
    });

    const second = await staffInSupport();
    await db.tenant.update({
      where: { id: tenantA },
      data: { status: 'archived', archivedAt: new Date(), archivedReason: 'closed' },
    });
    expect((await second.s.get('/api/v1/branches')).status).toBe(403);
    expect(
      await db.platformSupportSession.findUniqueOrThrow({ where: { id: second.view.id } }),
    ).toMatchObject({
      endReason: 'tenant_archived',
    });

    await db.tenant.update({
      where: { id: tenantA },
      data: { status: 'active', archivedAt: null, archivedReason: null },
    });
    const third = await staffInSupport();
    await db.platformRoleAssignment.updateMany({
      where: { userId: staffId },
      data: { revokedAt: new Date(), revokedReason: 'left' },
    });
    expect((await third.s.get('/api/v1/branches')).status).toBe(403);
    expect(
      await db.platformSupportSession.findUniqueOrThrow({ where: { id: third.view.id } }),
    ).toMatchObject({
      endReason: 'staff_role_revoked',
    });
  });

  it('opening another one ends the previous one: one live session per staff member', async () => {
    const { s, view } = await staffInSupport();
    const next = await s.post('/api/v1/platform/support-sessions', {
      tenantId: tenantB,
      reason: 'Other ticket',
    });
    expect(next.status).toBe(201);
    expect(
      await db.platformSupportSession.count({ where: { staffUserId: staffId, endedAt: null } }),
    ).toBe(1);
    expect(
      await db.platformSupportSession.findUniqueOrThrow({ where: { id: view.id } }),
    ).toMatchObject({
      endReason: 'ended',
    });
  });
});

describe('who and where', () => {
  it('suspended tenants may be opened (D-098); archived and unknown ones may not; a reason is required', async () => {
    await db.tenant.update({
      where: { id: tenantA },
      data: { status: 'suspended', suspendedAt: new Date(), suspendedReason: 'billing' },
    });
    const { s } = await staffInSupport();
    expect((await s.get('/api/v1/branches')).status).toBe(200);
    await db.tenant.update({
      where: { id: tenantB },
      data: { status: 'archived', archivedAt: new Date(), archivedReason: 'closed' },
    });
    expect(
      (await s.post('/api/v1/platform/support-sessions', { tenantId: tenantB, reason: 'Look' }))
        .status,
    ).toBe(409);
    expect(
      (
        await s.post('/api/v1/platform/support-sessions', {
          tenantId: '01900000-0000-7000-8000-00000000dead',
          reason: 'Look',
        })
      ).status,
    ).toBe(404);
    expect((await s.post('/api/v1/platform/support-sessions', { tenantId: tenantA })).status).toBe(
      422,
    );
  });

  it('tenant members cannot open support sessions', async () => {
    const admin = await actors.signIn('admin-a@example.test');
    expect(
      (
        await admin.post('/api/v1/platform/support-sessions', {
          tenantId: tenantA,
          reason: 'Try it',
        })
      ).status,
    ).toBe(403);
  });

  it('the database caps a session at 60 minutes and keeps one live per staff member', async () => {
    const auth = await db.authSession.create({
      data: {
        userId: staffId,
        tokenHash: 'a'.repeat(64),
        createdAt: new Date(),
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const base = {
      staffUserId: staffId,
      tenantId: tenantA,
      authSessionId: auth.id,
      reason: 'Check',
      startedAt: new Date(),
    };
    await expect(
      db.platformSupportSession.create({
        data: { ...base, expiresAt: new Date(Date.now() + 61 * 60_000) },
      }),
    ).rejects.toThrow('platform_support_sessions_max_60_min');
    await db.platformSupportSession.create({
      data: { ...base, expiresAt: new Date(Date.now() + 30 * 60_000) },
    });
    await expect(
      db.platformSupportSession.create({
        data: { ...base, expiresAt: new Date(Date.now() + 30 * 60_000) },
      }),
    ).rejects.toThrow();
  });
});

describe('isolation audit 2.4c fixes', () => {
  it('refused attempts are audited too (support.denied with the reason code)', async () => {
    const { s, view } = await staffInSupport();
    await s.post(`/api/v1/branches/${A1}/deactivate`, { reason: 'Support should not' });
    const member = await db.membership.findFirstOrThrow({ where: { tenantId: tenantA } });
    await s.get(`/api/v1/role-assignments?membershipId=${member.id}`);
    const denied = await db.auditEvent.findMany({
      where: { action: 'support.denied', supportSessionId: view.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(denied.map((e) => (e.after as { code: string }).code)).toEqual([
      'SUPPORT_READ_ONLY',
      'FORBIDDEN',
    ]);
    expect(denied.every((e) => e.tenantId === tenantA)).toBe(true);
  });

  it('during support only sign-out and support start/end may change anything; switching tenant is refused', async () => {
    // A staff account with a membership (possible only through the operator path).
    const { membershipId } = await actors.grant(staffId, tenantB, 'learner');
    const { s } = await staffInSupport();
    const archive = await s.post(`/api/v1/platform/tenants/${tenantB}/suspend`, {
      reason: 'Not now',
    });
    expect(archive.body.error.code).toBe('SUPPORT_READ_ONLY');
    const sw = await s.post('/api/v1/auth/session/tenant', { membershipId });
    expect(sw.status).toBe(403);
    // /auth/me reports the support session as the one source of truth.
    const me = await s.get('/api/v1/auth/me');
    expect(me.body.support).toMatchObject({ tenant: { id: tenantA } });
  });

  it('the database ties a support audit row to a session of its own tenant', async () => {
    const { view } = await staffInSupport();
    const base = {
      actorUserId: staffId,
      action: 'support.accessed',
      entityType: 'support_session',
      entityId: view.id,
      supportSessionId: view.id,
    };
    await expect(db.auditEvent.create({ data: { ...base, tenantId: tenantB } })).rejects.toThrow();
    await expect(db.auditEvent.create({ data: { ...base, tenantId: null } })).rejects.toThrow(
      'audit_events_support_needs_tenant',
    );
  });

  it('“current” is the session of this browser only', async () => {
    await staffInSupport();
    const other = await actors.signIn('psa@example.test');
    const current = CurrentSupportSession.parse(
      (await other.get('/api/v1/platform/support-sessions/current')).body,
    );
    expect(current.data).toBeNull();
  });

  it('two starts at once: one 201 and one 409, never a 500', async () => {
    const s = await actors.signIn('psa@example.test');
    const results = await Promise.all([
      s.post('/api/v1/platform/support-sessions', { tenantId: tenantA, reason: 'First tab' }),
      s.post('/api/v1/platform/support-sessions', { tenantId: tenantB, reason: 'Second tab' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await db.platformSupportSession.count({ where: { staffUserId: staffId, endedAt: null } }),
    ).toBe(1);
  });

  it('ends (audited) whenever the browser session ends: idle timeout, password change, deactivation', async () => {
    const idle = await staffInSupport();
    await db.authSession.updateMany({
      where: { userId: staffId, endedAt: null },
      data: { lastSeenAt: new Date(Date.now() - 9 * 60 * 60_000) },
    });
    expect((await idle.s.get('/api/v1/branches')).status).toBe(401);
    expect(
      await db.platformSupportSession.findUniqueOrThrow({ where: { id: idle.view.id } }),
    ).toMatchObject({
      endReason: 'signed_out',
    });

    const reset = await staffInSupport();
    await app.get(SessionsService).endAllForUser(staffId, 'password_changed');
    expect(
      await db.platformSupportSession.findUniqueOrThrow({ where: { id: reset.view.id } }),
    ).toMatchObject({
      endReason: 'signed_out',
    });
    expect(
      await db.auditEvent.count({
        where: { action: 'support_session.ended', supportSessionId: reset.view.id },
      }),
    ).toBe(1);
  });

  it('archiving the tenant through the platform API ends support into it at once', async () => {
    const { view } = await staffInSupport();
    const otherStaff = await actors.user('psa-2@example.test');
    await actors
      .memberships()
      .operatorGrantPlatformRole({ userId: otherStaff, role: 'platform_super_admin' }, OPERATOR);
    const s2 = await actors.signIn('psa-2@example.test');
    expect(
      (await s2.post(`/api/v1/platform/tenants/${tenantA}/archive`, { reason: 'Closed' })).status,
    ).toBe(200);
    expect(
      await db.platformSupportSession.findUniqueOrThrow({ where: { id: view.id } }),
    ).toMatchObject({
      endReason: 'tenant_archived',
    });
  });

  it('abandoned sessions are closed by the sweep as expired, audited', async () => {
    const { view } = await staffInSupport();
    const swept = await app
      .get(SupportSessionsService)
      .sweepExpired(new Date(Date.now() + 61 * 60_000));
    expect(swept).toBe(1);
    expect(
      await db.platformSupportSession.findUniqueOrThrow({ where: { id: view.id } }),
    ).toMatchObject({
      endReason: 'expired',
    });
    expect(
      await db.auditEvent.count({
        where: { action: 'support_session.expired', supportSessionId: view.id },
      }),
    ).toBe(1);
  });
});

describe('GET /auth/session (2.4d)', () => {
  it('a member sees the active tenant’s roles and permissions only; staff in support see SS permissions and no roles', async () => {
    const member = await actors.user('both@example.test');
    const a = await actors.grant(member, tenantA, 'tenant_admin');
    await actors.grant(member, tenantB, 'learner');
    const m = await actors.signIn('both@example.test');
    await m.post('/api/v1/auth/session/tenant', { membershipId: a.membershipId });
    const ctx = SessionContextView.parse((await m.get('/api/v1/auth/session')).body);
    expect(ctx.activeTenant?.tenantId).toBe(tenantA);
    expect(ctx.memberships.map((x) => [x.tenantId, x.active])).toEqual([
      [tenantA, true],
      [tenantB, false],
    ]);
    expect(ctx.roles).toEqual([{ role: 'tenant_admin', branch: null }]);
    expect(ctx.tenantPermissions).toContain('role.assign');
    expect(ctx.platformRoles).toEqual([]);
    expect(ctx.platformPermissions).toEqual([]);

    const { s } = await staffInSupport();
    const staff = SessionContextView.parse((await s.get('/api/v1/auth/session')).body);
    expect(staff.support?.tenant.id).toBe(tenantA);
    expect(staff.roles).toEqual([]);
    expect(staff.tenantPermissions).toEqual([...SUPPORT_PERMISSIONS].sort());
    expect(staff.platformRoles).toEqual(['platform_super_admin']);
    expect(staff.platformPermissions).toContain('platform.support_access.start');
  });
});
