import type { INestApplication } from '@nestjs/common';
import { AcceptedInvitation, InvitationListPage, InvitationView } from '@vachelearn/contracts';
import request from 'supertest';
import type { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../src/auth/passwords';
import { hashSessionToken } from '../src/auth/session-tokens';
import { INVITATION_LIMITS } from '../src/invitations/invitations.service';
import { JobsService } from '../src/jobs/jobs.service';
import { createTestApp, LogCapture, WEB } from './app';
import { resetDatabase, testPrisma } from './db';
import { realActors, TEST_PASSWORD } from './sessions';
import { buildTwoTenants, emailOf, type TwoTenants } from './two-tenants';

/*
 * Invitations (Slice 3.1; spec §5 ACs; D-050, D-115, D-116; matrix `invitation.*`) through real sessions on the shared
 * two-tenant fixture. The emailed link is read back from Mailpit (real SMTP), so the token exists only in the email.
 */

const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:58025';
const SMTP_PORT = process.env.MAILPIT_SMTP_PORT ?? '51025';
const NEW_PASSWORD = 'a long and private passphrase';

const logs = new LogCapture();
let app: INestApplication;
let db: PrismaClient;
let actors: ReturnType<typeof realActors>;
let f: TwoTenants;
let seq = 0;

beforeAll(async () => {
  ({ app } = await createTestApp({
    env: { EMAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT },
    logs,
  }));
  db = testPrisma();
  actors = realActors(app, db, await hashPassword(TEST_PASSWORD));
});
beforeEach(async () => {
  await resetDatabase(db);
  f = await buildTwoTenants(db, actors);
  logs.lines.length = 0;
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const http = () => request(app.getHttpServer());
const runJobs = () => app.get(JobsService).runDue('test-worker');
/** A fresh address per call: other mail in the local Mailpit never interferes. */
const fresh = () => `invitee-${Date.now().toString(36)}-${++seq}@example.test`;
const as = (person: Parameters<typeof emailOf>[0]) => actors.signIn(emailOf(person));

/** Tokens from the invitation emails Mailpit received for an address, newest first. */
async function inbox(email: string) {
  const res = await fetch(
    `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
  );
  const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] };
  return Promise.all(
    messages.map(async (m) => {
      const body = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${m.ID}`)).json()) as {
        Text: string;
      };
      const token = /\/accept-invite#token=([A-Za-z0-9_-]{43})/.exec(body.Text)?.[1];
      return { subject: m.Subject, text: body.Text, token };
    }),
  );
}

async function tokenFor(email: string) {
  await runJobs();
  const [latest] = await inbox(email);
  if (!latest?.token) throw new Error(`no invitation email for ${email}`);
  return latest.token;
}

async function invite(
  person: Parameters<typeof emailOf>[0],
  body: { email: string; role: string; branchId: string | null },
) {
  return (await as(person)).post('/api/v1/invitations', body);
}

const preview = (token: string) =>
  http().post('/api/v1/invitations/preview').set('origin', WEB).send({ token });
const accept = (token: string, displayName = 'Meera Iyer (Demo)', password = NEW_PASSWORD) =>
  http()
    .post('/api/v1/invitations/accept')
    .set('origin', WEB)
    .send({ token, displayName, password });

describe('creating an invitation', () => {
  it('a Tenant Admin invites; the email holds the only copy of the token, which is not logged', async () => {
    const email = fresh();
    const res = await invite('adminA', { email, role: 'learner', branchId: f.branch.A1 });
    expect(res.status).toBe(201);
    const view = InvitationView.parse(res.body);
    expect(view).toMatchObject({ email, role: 'learner', status: 'pending', canManage: true });
    expect(view.branch?.id).toBe(f.branch.A1);
    // D-050: the tenant's default validity, 7 days.
    const days = (Date.parse(view.expiresAt) - Date.parse(view.createdAt)) / 86_400_000;
    expect(days).toBeCloseTo(7, 3);

    const token = await tokenFor(email);
    const [mail] = await inbox(email);
    expect(mail!.subject).not.toContain(email);
    expect(mail!.subject).not.toContain('tenant-a');
    expect(mail!.text).toContain('tenant-a (Demo)');
    expect(mail!.text).toContain('Learner at Branch A1');
    const row = await db.invitation.findUniqueOrThrow({ where: { id: view.id } });
    expect(row.tokenHash).toBe(hashSessionToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    const job = await db.job.findFirstOrThrow({ where: { type: 'email.invitation' } });
    expect(JSON.stringify(job)).not.toContain(token);
    expect(logs.lines.join('\n')).not.toContain(token);

    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: 'invitation.created' } });
    expect(audit).toMatchObject({
      tenantId: f.tenant.A,
      branchId: f.branch.A1,
      actorUserId: f.user.adminA,
      entityId: view.id,
    });
    expect(JSON.stringify(audit)).not.toContain(email);
  });

  it('uses the tenant setting for validity (1–30 days, D-050)', async () => {
    const admin = await as('adminA');
    const current = await admin.get('/api/v1/tenant-settings');
    const bad = await admin.patch('/api/v1/tenant-settings', {
      version: current.body.version,
      invitationExpiryDays: 31,
    });
    expect(bad.status).toBe(422);
    const ok = await admin.patch('/api/v1/tenant-settings', {
      version: current.body.version,
      invitationExpiryDays: 30,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.invitationExpiryDays).toBe(30);
    const res = await admin.post('/api/v1/invitations', {
      email: fresh(),
      role: 'learner',
      branchId: null,
    });
    const days = (Date.parse(res.body.expiresAt) - Date.parse(res.body.createdAt)) / 86_400_000;
    expect(days).toBeCloseTo(30, 3);
  });

  it('a Branch Admin invites Learners and Instructors to its own branch only', async () => {
    const ba = await as('baA1');
    expect(
      (
        await ba.post('/api/v1/invitations', {
          email: fresh(),
          role: 'instructor',
          branchId: f.branch.A1,
        })
      ).status,
    ).toBe(201);
    const other = await ba.post('/api/v1/invitations', {
      email: fresh(),
      role: 'learner',
      branchId: f.branch.A2,
    });
    expect(other.status).toBe(404);
    const role = await ba.post('/api/v1/invitations', {
      email: fresh(),
      role: 'learning_manager',
      branchId: f.branch.A1,
    });
    expect(role.status).toBe(403);
    const wide = await ba.post('/api/v1/invitations', {
      email: fresh(),
      role: 'learner',
      branchId: null,
    });
    expect(wide.status).toBe(422);
    expect(await db.invitation.count()).toBe(1);
  });

  it('branch admin of A1 cannot invite to tenant B branch B1; tenant admin of A cannot either', async () => {
    for (const person of ['baA1', 'adminA'] as const) {
      const res = await invite(person, { email: fresh(), role: 'learner', branchId: f.branch.B1 });
      expect(res.status).toBe(404);
    }
    expect(await db.invitation.count()).toBe(0);
  });

  it('checks the role and branch shape', async () => {
    const admin = await as('adminA');
    const ba = await admin.post('/api/v1/invitations', {
      email: fresh(),
      role: 'branch_admin',
      branchId: null,
    });
    expect(ba.status).toBe(422);
    const ta = await admin.post('/api/v1/invitations', {
      email: fresh(),
      role: 'tenant_admin',
      branchId: f.branch.A1,
    });
    expect(ta.status).toBe(422);
    const tenantId = await admin.post('/api/v1/invitations', {
      email: fresh(),
      role: 'learner',
      branchId: null,
      tenantId: f.tenant.B,
    });
    expect(tenantId.status).toBe(422);
  });

  it('roles without invitation.create are refused (deny by default)', async () => {
    for (const person of ['lmA', 'cvA', 'insA1', 'learnerA1'] as const) {
      const signedIn = await as(person);
      const res = await signedIn.post('/api/v1/invitations', {
        email: fresh(),
        role: 'learner',
        branchId: f.branch.A1,
      });
      expect(res.status).toBe(403);
      expect((await signedIn.get('/api/v1/invitations')).status).toBe(403);
    }
  });

  it('refuses an existing member, active or deactivated, with a pointer (D-115)', async () => {
    const admin = await as('adminA');
    const active = await admin.post('/api/v1/invitations', {
      email: emailOf('learnerA1'),
      role: 'instructor',
      branchId: f.branch.A1,
    });
    expect(active.status).toBe(409);
    expect(active.body.error.code).toBe('ALREADY_MEMBER');
    expect(
      (
        await admin.post(`/api/v1/people/${f.member.learnerA2}/deactivate`, {
          reason: 'Left the company',
        })
      ).status,
    ).toBe(200);
    const deactivated = await admin.post('/api/v1/invitations', {
      email: emailOf('learnerA2'),
      role: 'learner',
      branchId: f.branch.A2,
    });
    expect(deactivated.status).toBe(409);
    expect(deactivated.body.error.code).toBe('ALREADY_MEMBER');
  });

  it('refuses platform staff with a generic answer (D-037); a member of another tenant may be invited', async () => {
    const staff = await invite('adminA', {
      email: emailOf('staff'),
      role: 'learner',
      branchId: null,
    });
    expect(staff.status).toBe(409);
    expect(staff.body.error.code).toBe('CANNOT_INVITE');
    const otherTenant = await invite('adminA', {
      email: emailOf('learnerB1'),
      role: 'learner',
      branchId: f.branch.A1,
    });
    expect(otherTenant.status).toBe(201);
  });

  it('one pending invitation per address: a second is refused, also when sent at the same moment', async () => {
    const admin = await as('adminA');
    const email = fresh();
    const body = { email, role: 'learner', branchId: f.branch.A1 };
    const [a, b] = await Promise.all([
      admin.post('/api/v1/invitations', body),
      admin.post('/api/v1/invitations', body),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect((a.status === 409 ? a : b).body.error.code).toBe('INVITATION_PENDING');
    // The address is normalised, so a different case is the same address.
    const upper = await admin.post('/api/v1/invitations', { ...body, email: email.toUpperCase() });
    expect(upper.status).toBe(409);
    expect(await db.invitation.count({ where: { email } })).toBe(1);
  });

  it('branch admin of A1 cannot replace an expired A2 or tenant-wide invitation', async () => {
    const admin = await as('adminA');
    const a2 = fresh();
    const wide = fresh();
    const onA2 = await admin.post('/api/v1/invitations', {
      email: a2,
      role: 'learner',
      branchId: f.branch.A2,
    });
    const tenantWide = await admin.post('/api/v1/invitations', {
      email: wide,
      role: 'tenant_admin',
      branchId: null,
    });
    await expire(onA2.body.id);
    await expire(tenantWide.body.id);
    const ba = await as('baA1');
    for (const email of [a2, wide]) {
      const res = await ba.post('/api/v1/invitations', {
        email,
        role: 'learner',
        branchId: f.branch.A1,
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVITATION_PENDING');
    }
    for (const id of [onA2.body.id, tenantWide.body.id]) {
      expect((await db.invitation.findUniqueOrThrow({ where: { id } })).status).toBe('pending');
    }
    expect(await db.invitation.count({ where: { createdById: f.user.baA1 } })).toBe(0);
  });

  it('the same address may be pending in tenant A and tenant B at once (uniqueness is per tenant)', async () => {
    const email = fresh();
    expect((await invite('adminA', { email, role: 'learner', branchId: null })).status).toBe(201);
    expect((await invite('adminB', { email, role: 'learner', branchId: null })).status).toBe(201);
  });

  it('an expired pending invitation is replaced by a new one', async () => {
    const admin = await as('adminA');
    const email = fresh();
    const first = await admin.post('/api/v1/invitations', {
      email,
      role: 'learner',
      branchId: null,
    });
    await expire(first.body.id);
    const second = await admin.post('/api/v1/invitations', {
      email,
      role: 'instructor',
      branchId: f.branch.A1,
    });
    expect(second.status).toBe(201);
    const old = await db.invitation.findUniqueOrThrow({ where: { id: first.body.id } });
    expect(old).toMatchObject({ status: 'revoked', revokedReason: 'Replaced by a new invitation' });
  });
});

describe('listing invitations', () => {
  async function three() {
    const admin = await as('adminA');
    const ids: Record<string, string> = {};
    for (const [key, body] of Object.entries({
      a1: { role: 'learner', branchId: f.branch.A1 },
      a2: { role: 'learner', branchId: f.branch.A2 },
      wide: { role: 'learning_manager', branchId: null },
      baA1: { role: 'branch_admin', branchId: f.branch.A1 },
    })) {
      ids[key] = (await admin.post('/api/v1/invitations', { email: fresh(), ...body })).body.id;
    }
    return ids;
  }

  it('tenant admin of A listing with branchId=B1 gets nothing from tenant B', async () => {
    await invite('adminB', { email: fresh(), role: 'learner', branchId: f.branch.B1 });
    const res = await (await as('adminA')).get(`/api/v1/invitations?branchId=${f.branch.B1}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('a Tenant Admin sees all of its tenant and none of tenant B', async () => {
    const ids = await three();
    await invite('adminB', { email: fresh(), role: 'learner', branchId: f.branch.B1 });
    const page = InvitationListPage.parse(
      (await (await as('adminA')).get('/api/v1/invitations')).body,
    );
    expect(page.data.map((i) => i.id).sort()).toEqual(Object.values(ids).sort());
    const b = InvitationListPage.parse(
      (await (await as('adminB')).get('/api/v1/invitations')).body,
    );
    expect(b.data).toHaveLength(1);
    expect(b.data.map((i) => i.id)).not.toContain(ids.a1);
  });

  it('branch admin of A1 lists only A1 invitations, also with a branchId=A2 filter', async () => {
    const ids = await three();
    const ba = await as('baA1');
    const page = InvitationListPage.parse((await ba.get('/api/v1/invitations')).body);
    expect(page.data.map((i) => i.id).sort()).toEqual([ids.a1, ids.baA1].sort());
    // It manages the Learner invitation, not the Branch Admin one (granting rules).
    expect(page.data.find((i) => i.id === ids.a1)?.canManage).toBe(true);
    expect(page.data.find((i) => i.id === ids.baA1)?.canManage).toBe(false);
    const filtered = await ba.get(`/api/v1/invitations?branchId=${f.branch.A2}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.data).toEqual([]);
  });

  it('a cursor from tenant A is refused (422) for tenant B, and a Tenant Admin cursor for a Branch Admin', async () => {
    await three();
    const admin = await as('adminA');
    const first = await admin.get('/api/v1/invitations?limit=1');
    const cursor = String(first.body.page.nextCursor);
    expect(cursor).not.toBe('null');
    expect((await admin.get(`/api/v1/invitations?limit=1&cursor=${cursor}`)).status).toBe(200);
    for (const person of ['adminB', 'baA1'] as const) {
      const res = await (await as(person)).get(`/api/v1/invitations?limit=1&cursor=${cursor}`);
      expect(res.status).toBe(422);
    }
  });

  it('expired is shown from the expiry date and filters both ways', async () => {
    const ids = await three();
    await expire(ids.a2!);
    const admin = await as('adminA');
    const expired = await admin.get('/api/v1/invitations?status=expired');
    expect(expired.body.data.map((i: InvitationView) => i.id)).toEqual([ids.a2]);
    expect(expired.body.data[0].canManage).toBe(true);
    const pending = await admin.get('/api/v1/invitations?status=pending');
    expect(pending.body.data.map((i: InvitationView) => i.id)).not.toContain(ids.a2);
    expect(pending.body.data).toHaveLength(3);
  });
});

describe('resending and cancelling', () => {
  it('resend: the old link stops working, the new one works, the validity restarts', async () => {
    const admin = await as('adminA');
    const email = fresh();
    const created = await admin.post('/api/v1/invitations', {
      email,
      role: 'learner',
      branchId: null,
    });
    const oldToken = await tokenFor(email);
    await expire(created.body.id);
    const resent = await admin.post(`/api/v1/invitations/${created.body.id}/resend`);
    expect(resent.status).toBe(200);
    expect(resent.body.status).toBe('pending');
    expect((await preview(oldToken)).status).toBe(400);
    const newToken = await tokenFor(email);
    expect(newToken).not.toBe(oldToken);
    expect((await preview(newToken)).status).toBe(200);
    expect(await db.auditEvent.count({ where: { action: 'invitation.resent' } })).toBe(1);
  });

  it('a resend before the first email went out sends one email, for the latest send only', async () => {
    const admin = await as('adminA');
    const email = fresh();
    const created = await admin.post('/api/v1/invitations', {
      email,
      role: 'learner',
      branchId: null,
    });
    await admin.post(`/api/v1/invitations/${created.body.id}/resend`);
    await runJobs();
    const mails = await inbox(email);
    expect(mails).toHaveLength(1);
    expect((await preview(mails[0]!.token!)).status).toBe(200);
  });

  it('cancel needs a reason; the link stops working; it cannot be cancelled twice', async () => {
    const admin = await as('adminA');
    const email = fresh();
    const created = await admin.post('/api/v1/invitations', {
      email,
      role: 'learner',
      branchId: null,
    });
    const token = await tokenFor(email);
    const id = created.body.id as string;
    expect((await admin.post(`/api/v1/invitations/${id}/revoke`, {})).status).toBe(422);
    const revoked = await admin.post(`/api/v1/invitations/${id}/revoke`, {
      reason: 'Wrong address',
    });
    expect(revoked.status).toBe(200);
    expect(revoked.body).toMatchObject({
      status: 'revoked',
      revokedReason: 'Wrong address',
      canManage: false,
    });
    expect((await preview(token)).status).toBe(400);
    expect((await accept(token)).status).toBe(400);
    expect((await admin.post(`/api/v1/invitations/${id}/revoke`, { reason: 'Again' })).status).toBe(
      409,
    );
    expect((await admin.post(`/api/v1/invitations/${id}/resend`)).status).toBe(409);
  });

  it('tenant B and branch admin of A1 cannot resend or cancel an A2 invitation (404)', async () => {
    const created = await invite('adminA', {
      email: fresh(),
      role: 'learner',
      branchId: f.branch.A2,
    });
    const id = created.body.id as string;
    for (const person of ['adminB', 'baB1', 'baA1'] as const) {
      const signedIn = await as(person);
      expect((await signedIn.post(`/api/v1/invitations/${id}/resend`)).status).toBe(404);
      expect(
        (await signedIn.post(`/api/v1/invitations/${id}/revoke`, { reason: 'Not needed any more' }))
          .status,
      ).toBe(404);
    }
    const row = await db.invitation.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: 'pending', sendCount: 1 });
  });

  it('branch admin of A1 cannot cancel a Branch Admin invitation on A1 (403)', async () => {
    const created = await invite('adminA', {
      email: fresh(),
      role: 'branch_admin',
      branchId: f.branch.A1,
    });
    const ba = await as('baA1');
    const res = await ba.post(`/api/v1/invitations/${String(created.body.id)}/revoke`, {
      reason: 'Not needed any more',
    });
    expect(res.status).toBe(403);
  });
});

describe('accepting', () => {
  it('a new person: preview, accept, then sign in (D-116); the link works once', async () => {
    const email = fresh();
    await invite('baA1', { email, role: 'instructor', branchId: f.branch.A1 });
    const token = await tokenFor(email);
    const shown = await preview(token);
    expect(shown.status).toBe(200);
    expect(shown.body).toMatchObject({
      organisation: 'tenant-a (Demo)',
      role: 'instructor',
      branch: 'Branch A1',
      email,
      accountExists: false,
    });

    const weak = await accept(token, 'Meera Iyer (Demo)', 'short');
    expect(weak.status).toBe(422);
    expect(weak.body.error.fieldErrors[0].field).toBe('password');

    const res = await accept(token);
    expect(res.status).toBe(201);
    expect(res.headers['set-cookie']).toBeUndefined();
    const accepted = AcceptedInvitation.parse(res.body);
    const membership = await db.membership.findUniqueOrThrow({
      where: { id: accepted.membershipId },
      include: { branches: true, roleAssignments: true, user: true },
    });
    expect(membership).toMatchObject({ tenantId: f.tenant.A, primaryBranchId: f.branch.A1 });
    expect(membership.user.email).toBe(email);
    expect(membership.user.emailVerifiedAt).not.toBeNull();
    expect(membership.branches.map((b) => b.branchId)).toEqual([f.branch.A1]);
    expect(membership.roleAssignments.map((r) => [r.role, r.branchId])).toEqual([
      ['instructor', f.branch.A1],
    ]);
    const role = await db.auditEvent.findFirstOrThrow({
      where: { action: 'role.assigned', entityId: membership.roleAssignments[0]!.id },
    });
    expect(role.actorUserId).toBe(f.user.baA1);
    expect(role.reason).toBe('Invitation accepted');
    const done = await db.auditEvent.findFirstOrThrow({ where: { action: 'invitation.accepted' } });
    expect(done.actorUserId).toBe(membership.userId);

    // Used once.
    expect((await accept(token)).status).toBe(400);
    expect((await preview(token)).status).toBe(400);
    // The person signs in with the new password and lands in tenant A.
    const login = await http()
      .post('/api/v1/auth/login')
      .set('origin', WEB)
      .send({ email, password: NEW_PASSWORD });
    expect(login.status).toBe(200);
    expect(JSON.stringify(login.body)).toContain(f.tenant.A);
    expect(logs.lines.join('\n')).not.toContain(token);
    expect(logs.lines.join('\n')).not.toContain(NEW_PASSWORD);
  });

  it('the same link accepted twice at once creates one account and one membership', async () => {
    const email = fresh();
    await invite('adminA', { email, role: 'learner', branchId: null });
    const token = await tokenFor(email);
    const results = await Promise.all([accept(token), accept(token), accept(token)]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await db.user.count({ where: { email } })).toBe(1);
    expect(await db.membership.count({ where: { user: { email } } })).toBe(1);
  });

  it('an unknown, malformed, expired or suspended-tenant link is the same 400', async () => {
    expect((await preview('A'.repeat(43))).body.error.code).toBe('INVALID_LINK');
    expect((await preview('short')).status).toBe(422);
    const email = fresh();
    const created = await invite('adminA', { email, role: 'learner', branchId: null });
    const token = await tokenFor(email);
    await expire(created.body.id);
    expect((await preview(token)).status).toBe(400);
    expect((await accept(token)).status).toBe(400);

    const email2 = fresh();
    await invite('adminA', { email: email2, role: 'learner', branchId: null });
    const token2 = await tokenFor(email2);
    await db.tenant.update({
      where: { id: f.tenant.A },
      data: { status: 'suspended', suspendedAt: new Date(), suspendedReason: 'Unpaid invoice' },
    });
    expect((await preview(token2)).status).toBe(400);
    expect((await accept(token2)).status).toBe(400);
  });

  it('an existing account must sign in as the invited address (D-116)', async () => {
    const email = emailOf('learnerB1');
    await invite('adminA', { email, role: 'learner', branchId: f.branch.A1 });
    const token = await tokenFor(email);
    expect((await preview(token)).body.accountExists).toBe(true);
    const anon = await accept(token);
    expect(anon.status).toBe(409);
    expect(anon.body.error.code).toBe('SIGN_IN_REQUIRED');

    const wrong = await (await as('adminB')).post('/api/v1/me/invitations/accept', { token });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe('WRONG_ACCOUNT');
    expect((await db.invitation.findFirstOrThrow({ where: { email } })).status).toBe('pending');

    const right = await (await as('learnerB1')).post('/api/v1/me/invitations/accept', { token });
    expect(right.status).toBe(201);
    expect(await db.membership.count({ where: { userId: f.user.learnerB1 } })).toBe(2);
    expect(
      (await (await as('learnerB1')).post('/api/v1/me/invitations/accept', { token })).status,
    ).toBe(400);
  });

  it('accept-existing needs a session', async () => {
    const res = await http()
      .post('/api/v1/me/invitations/accept')
      .set('origin', WEB)
      .send({ token: 'A'.repeat(43) });
    expect(res.status).toBe(401);
  });

  it('a link stops working when the inviter lost the authority to grant it', async () => {
    const email = fresh();
    await invite('baA1', { email, role: 'learner', branchId: f.branch.A1 });
    const token = await tokenFor(email);
    await db.roleAssignment.updateMany({
      where: { membershipId: f.member.baA1 },
      data: { revokedAt: new Date(), revokedById: f.user.adminA, revokedReason: 'Moved' },
    });
    expect((await accept(token)).status).toBe(400);
    expect(await db.user.count({ where: { email } })).toBe(0);
  });

  it('a link to a branch deactivated meanwhile stops working', async () => {
    const email = fresh();
    await invite('adminA', { email, role: 'learner', branchId: f.branch.A2 });
    const token = await tokenFor(email);
    const admin = await as('adminA');
    expect(
      (await admin.post(`/api/v1/branches/${f.branch.A2}/deactivate`, { reason: 'Closed' })).status,
    ).toBe(200);
    expect((await accept(token)).status).toBe(400);
  });
});

describe('limits and history', () => {
  it('link use is limited per link, so a crew behind one address is not (D-117)', async () => {
    const max = INVITATION_LIMITS.linkToken.max;
    for (let i = 0; i < max; i++) expect((await preview('B'.repeat(43))).status).toBe(400);
    expect((await preview('B'.repeat(43))).status).toBe(429);
    // Other links from the same network still work.
    expect((await preview('C'.repeat(43))).status).toBe(400);
  });

  it('link use has a per-network flood cap (D-117)', async () => {
    const max = INVITATION_LIMITS.link.max;
    const token = (i: number) => i.toString(36).padStart(43, 'x');
    for (let i = 0; i < max; i++) expect((await preview(token(i))).status).toBe(400);
    expect((await preview(token(max))).status).toBe(429);
  });

  it('one invitation is resent at most 5 times a day (D-117)', async () => {
    const admin = await as('adminA');
    const created = await admin.post('/api/v1/invitations', {
      email: fresh(),
      role: 'learner',
      branchId: null,
    });
    const id = created.body.id as string;
    for (let i = 0; i < INVITATION_LIMITS.resendInvitation.max; i++) {
      expect((await admin.post(`/api/v1/invitations/${id}/resend`)).status).toBe(200);
    }
    const over = await admin.post(`/api/v1/invitations/${id}/resend`);
    expect(over.status).toBe(429);
    expect((await db.invitation.findUniqueOrThrow({ where: { id } })).sendCount).toBe(6);
  });

  it('a resend is refused when the inviter can no longer grant the role (it would send a dead link)', async () => {
    const created = await invite('baA1', {
      email: fresh(),
      role: 'learner',
      branchId: f.branch.A1,
    });
    await db.roleAssignment.updateMany({
      where: { membershipId: f.member.baA1 },
      data: { revokedAt: new Date(), revokedById: f.user.adminA, revokedReason: 'Moved' },
    });
    const res = await (
      await as('adminA')
    ).post(`/api/v1/invitations/${String(created.body.id)}/resend`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVITER_CANNOT_GRANT');
  });

  it('accepting while signed in needs the CSRF token and the web origin', async () => {
    const signedIn = await as('learnerB1');
    const noCsrf = await http()
      .post('/api/v1/me/invitations/accept')
      .set('origin', WEB)
      .set('cookie', signedIn.cookie)
      .send({ token: 'A'.repeat(43) });
    expect(noCsrf.status).toBe(403);
    const foreign = await http()
      .post('/api/v1/me/invitations/accept')
      .set('origin', 'https://evil.example')
      .set('cookie', signedIn.cookie)
      .send({ token: 'A'.repeat(43) });
    expect(foreign.status).toBe(403);
  });

  it('the database refuses a tenant A invitation on a tenant B branch, and a pending grant cannot be rewritten', async () => {
    await expect(
      db.invitation.create({
        data: {
          tenantId: f.tenant.A,
          email: fresh(),
          role: 'learner',
          branchId: f.branch.B1,
          expiresAt: new Date(Date.now() + 86_400_000),
          createdById: f.user.adminA,
        },
      }),
    ).rejects.toThrow();
    const created = await invite('adminA', { email: fresh(), role: 'learner', branchId: null });
    const id = created.body.id as string;
    await expect(
      db.invitation.update({ where: { id }, data: { tenantId: f.tenant.B } }),
    ).rejects.toThrow();
    await expect(
      db.invitation.update({ where: { id }, data: { role: 'tenant_admin' } }),
    ).rejects.toThrow();
    expect((await db.invitation.findUniqueOrThrow({ where: { id } })).role).toBe('learner');
  });

  it('closed invitations are history: the database refuses to change or delete them', async () => {
    const created = await invite('adminA', { email: fresh(), role: 'learner', branchId: null });
    const id = created.body.id as string;
    await expect(db.invitation.delete({ where: { id } })).rejects.toThrow();
    await (
      await as('adminA')
    ).post(`/api/v1/invitations/${id}/revoke`, { reason: 'Wrong address' });
    await expect(
      db.invitation.update({ where: { id }, data: { revokedReason: 'Rewritten' } }),
    ).rejects.toThrow();
  });
});

/** Expires an invitation now: its expiry 1 ms after creation (the grant columns, creation date included, are frozen). */
async function expire(id: string) {
  await db.$executeRaw`UPDATE invitations SET expires_at = created_at + interval '1 millisecond' WHERE id = ${id}::uuid`;
}
