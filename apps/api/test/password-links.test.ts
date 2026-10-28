import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { PrismaClient } from '../generated/prisma/client';
import {
  PASSWORD_LIMITS,
  PASSWORD_LINK_JOB,
  PasswordLinksService,
} from '../src/auth/password-links.service';
import { hashSessionToken, SESSION_COOKIE } from '../src/auth/session-tokens';
import { JobsService } from '../src/jobs/jobs.service';
import { UsersService } from '../src/users/users.service';
import { createTestApp, LogCapture, WEB } from './app';
import { resetDatabase, testPrisma } from './db';

/*
 * Set-password and reset links (Slice 2.3c; D-081, D-083, D-087; spec §5 ACs): created by the operator path, delivered
 * through the job runner to a real SMTP server (Mailpit), read back from the delivered email and consumed through the
 * API. Every address is unique per test, so other mail in the local Mailpit never interferes.
 */

const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:58025';
const SMTP_PORT = process.env.MAILPIT_SMTP_PORT ?? '51025';
const PASSWORD = 'a long and private passphrase';

const logs = new LogCapture();
let app: INestApplication;
let db: PrismaClient;

beforeAll(async () => {
  ({ app } = await createTestApp({
    env: { EMAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT },
    logs,
  }));
  db = testPrisma();
});
beforeEach(async () => {
  await resetDatabase(db);
  logs.lines.length = 0;
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const http = () => request(app.getHttpServer());
const address = () => `user-${randomUUID().slice(0, 8)}@example.test`;
const runJobs = () => app.get(JobsService).runDue('test-worker');

async function createAccount(email = address()) {
  const user = await app
    .get(UsersService)
    .createWithSetupLink(
      { email, displayName: 'Asha Rao (Demo)' },
      { userId: null, requestId: null, reason: 'test' },
    );
  return { ...user, email };
}

/** The links Mailpit received for an address, newest first: { subject, token }. */
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
      const match = /\/(set-password|reset-password)#token=([A-Za-z0-9_-]{43})/.exec(body.Text);
      return { subject: m.Subject, path: match?.[1], token: match?.[2], text: body.Text };
    }),
  );
}

const setPassword = (token: string, password = PASSWORD) =>
  http().post('/api/v1/auth/password/set').set('origin', WEB).send({ token, password });
/** Asks for a link and waits for the lookup that runs after the 202. */
const forgot = async (email: string) => {
  const res = await http().post('/api/v1/auth/password/forgot').set('origin', WEB).send({ email });
  await app.get(PasswordLinksService).settled();
  return res;
};
const login = (email: string, password = PASSWORD) =>
  http().post('/api/v1/auth/login').set('origin', WEB).send({ email, password });

describe('a new account (D-083)', () => {
  it('starts without a password; its set-password email holds the only copy of the token', async () => {
    const user = await createAccount();
    // Queued with ids only, in the same transaction as the user.
    const job = await db.job.findFirstOrThrow({ where: { type: PASSWORD_LINK_JOB } });
    expect(Object.keys(job.payload as object).sort()).toEqual(['kind', 'requestId', 'userId']);
    expect(await db.passwordLink.count()).toBe(0);
    expect(
      await db.auditEvent.count({ where: { action: 'user.created', entityId: user.id } }),
    ).toBe(1);

    await runJobs();
    const [mail] = await inbox(user.email);
    expect(mail).toMatchObject({ subject: 'Set your VacheLearn password', path: 'set-password' });
    expect(mail!.text).toContain(`${WEB}/set-password#token=`);
    const link = await db.passwordLink.findFirstOrThrow();
    expect(link.purpose).toBe('set_password');
    expect(link.tokenHash).not.toContain(mail!.token!);
    expect(link.expiresAt.getTime() - link.createdAt.getTime()).toBe(7 * 24 * 60 * 60_000);
    // No password yet: sign-in fails like any other failure.
    expect((await login(user.email)).status).toBe(401);
  });

  it('following the link sets the password, verifies the address, and works once', async () => {
    const user = await createAccount();
    await runJobs();
    const [mail] = await inbox(user.email);
    expect((await setPassword(mail!.token!)).status).toBe(204);
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.emailVerifiedAt).not.toBeNull();
    expect((await login(user.email)).status).toBe(200);
    expect(await db.auditEvent.count({ where: { action: 'auth.password_set' } })).toBe(1);

    const again = await setPassword(mail!.token!, 'another long passphrase');
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_LINK');
  });

  it('a weak password is a field error and leaves the link usable', async () => {
    const user = await createAccount();
    await runJobs();
    const [mail] = await inbox(user.email);
    const weak = await setPassword(mail!.token!, 'qwertyuiopasdfghjkl');
    expect(weak.status).toBe(422);
    expect(weak.body.error.fieldErrors).toEqual([
      expect.objectContaining({ field: 'password', code: 'too_common' }),
    ]);
    expect((await setPassword(mail!.token!, 'short')).body.error.fieldErrors[0].code).toBe(
      'too_short',
    );
    expect((await setPassword(mail!.token!)).status).toBe(204);
  });

  it('an expired, unknown or malformed token is refused', async () => {
    const user = await createAccount();
    await runJobs();
    const [mail] = await inbox(user.email);
    await db.passwordLink.updateMany({
      data: {
        createdAt: new Date(Date.now() - 8 * 86_400_000),
        expiresAt: new Date(Date.now() - 1),
      },
    });
    expect((await setPassword(mail!.token!)).body.error.code).toBe('INVALID_LINK');
    expect((await setPassword('A'.repeat(43))).status).toBe(400);
    expect((await setPassword('not-a-token')).status).toBe(422);
  });

  it('a deactivated account’s link no longer works and no email goes out for it', async () => {
    const user = await createAccount();
    await db.user.update({
      where: { id: user.id },
      data: { status: 'deactivated', deactivatedAt: new Date() },
    });
    await runJobs();
    expect(await inbox(user.email)).toHaveLength(0);
    const job = await db.job.findFirstOrThrow({ where: { type: PASSWORD_LINK_JOB } });
    expect(job).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('a duplicate address is a field error, and nothing is queued', async () => {
    const email = address();
    await createAccount(email);
    await expect(createAccount(email.toUpperCase())).rejects.toMatchObject({
      fieldErrors: [expect.objectContaining({ field: 'email', code: 'taken' })],
    });
    expect(await db.job.count()).toBe(1);
  });
});

describe('forgot password (D-087)', () => {
  async function accountWithPassword() {
    const user = await createAccount();
    await runJobs();
    const [mail] = await inbox(user.email);
    expect((await setPassword(mail!.token!)).status).toBe(204);
    return user;
  }

  it('answers 202 for everyone; only an active account gets an email', async () => {
    const user = await accountWithPassword();
    const before = await db.job.count();
    const unknown = await forgot(address());
    expect(unknown.status).toBe(202);
    expect(await db.job.count()).toBe(before);

    const known = await forgot(user.email.toUpperCase());
    expect(known.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    await runJobs();
    const [mail] = await inbox(user.email);
    expect(mail).toMatchObject({
      subject: 'Reset your VacheLearn password',
      path: 'reset-password',
    });
    const link = await db.passwordLink.findFirstOrThrow({ where: { purpose: 'reset_password' } });
    expect(link.expiresAt.getTime() - link.createdAt.getTime()).toBe(30 * 60_000);
  });

  it('resetting ends every existing session (D-049) and audits it', async () => {
    const user = await accountWithPassword();
    const signedIn = await login(user.email);
    const cookie = String(signedIn.headers['set-cookie']).split(';')[0]!;
    expect(cookie.startsWith(`${SESSION_COOKIE}=`)).toBe(true);
    await forgot(user.email);
    await runJobs();
    const [reset] = await inbox(user.email);
    expect((await setPassword(reset!.token!, 'a brand new passphrase')).status).toBe(204);
    expect((await http().get('/api/v1/auth/me').set('cookie', cookie)).status).toBe(401);
    expect(await db.authSession.findFirstOrThrow()).toMatchObject({
      endReason: 'password_changed',
    });
    expect((await login(user.email)).status).toBe(401);
    expect((await login(user.email, 'a brand new passphrase')).status).toBe(200);
    expect(await db.auditEvent.count({ where: { action: 'auth.password_reset' } })).toBe(1);
  });

  it('a newer link revokes the older one: only the newest works', async () => {
    const user = await accountWithPassword();
    await forgot(user.email);
    await runJobs();
    await forgot(user.email);
    await runJobs();
    const [newest, older] = await inbox(user.email);
    expect(newest!.token).not.toBe(older!.token);
    expect((await setPassword(older!.token!)).body.error.code).toBe('INVALID_LINK');
    expect((await setPassword(newest!.token!)).status).toBe(204);
  });

  it('without a password yet, forgot sends a fresh set-password link', async () => {
    const user = await createAccount();
    await runJobs();
    await forgot(user.email);
    await runJobs();
    const [newest, first] = await inbox(user.email);
    expect(newest!.path).toBe('set-password');
    expect((await setPassword(first!.token!)).status).toBe(400);
    expect((await setPassword(newest!.token!)).status).toBe(204);
  });

  it('is rate-limited per account, the same for known and unknown addresses (429)', async () => {
    const user = await accountWithPassword();
    for (const email of [user.email, address()]) {
      for (let i = 0; i < PASSWORD_LIMITS.forgotAccount.max; i++) {
        expect((await forgot(email)).status).toBe(202);
      }
      expect((await forgot(email)).status).toBe(429);
    }
  });

  it('no token, link or address reaches the logs or the job table', async () => {
    const user = await accountWithPassword();
    await forgot(user.email);
    await runJobs();
    const tokens = (await inbox(user.email)).map((m) => m.token!);
    const stored =
      JSON.stringify(await db.job.findMany()) + JSON.stringify(await db.passwordLink.findMany());
    const logged = logs.lines.join('\n');
    for (const leak of [...tokens, user.email, PASSWORD]) {
      expect(stored).not.toContain(leak);
      expect(logged).not.toContain(leak);
    }
  });
});

describe('security review 2.3c fixes', () => {
  it('two requests with the same link at once: exactly one succeeds', async () => {
    const user = await createAccount();
    await runJobs();
    const [mail] = await inbox(user.email);
    const results = await Promise.all([setPassword(mail!.token!), setPassword(mail!.token!)]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 400]);
    expect(await db.auditEvent.count({ where: { action: 'auth.password_set' } })).toBe(1);
  });

  it('a set-password link stops working once the account has a password', async () => {
    const user = await createAccount();
    // A set-password link that slipped out before the password was set (a race the row lock now prevents).
    const token = 'S'.repeat(43);
    await db.passwordLink.create({
      data: {
        userId: user.id,
        purpose: 'set_password',
        tokenHash: hashSessionToken(token),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await db.userCredential.create({
      data: {
        userId: user.id,
        passwordHash: '$argon2id$v=19$m=1,t=1,p=1$AA$AA',
        changedAt: new Date(),
      },
    });
    expect((await setPassword(token)).body.error.code).toBe('INVALID_LINK');
    expect(
      (await db.userCredential.findUniqueOrThrow({ where: { userId: user.id } })).passwordHash,
    ).toBe('$argon2id$v=19$m=1,t=1,p=1$AA$AA');
  });

  it('two link emails for one user at the same time both send, leaving one live link', async () => {
    const user = await createAccount();
    await forgot(user.email);
    const due = await db.job.findMany({ where: { type: PASSWORD_LINK_JOB } });
    expect(due).toHaveLength(2);
    const service = app.get(JobsService);
    await Promise.all(due.map((job) => service.runJob(`w-${job.id}`, job.id)));
    const jobs = await db.job.findMany({ where: { type: PASSWORD_LINK_JOB } });
    expect(jobs.map((j) => j.status)).toEqual(['succeeded', 'succeeded']);
    expect(await db.passwordLink.count({ where: { usedAt: null, revokedAt: null } })).toBe(1);
  });

  it('a state change from another origin is refused before anything runs', async () => {
    const user = await createAccount();
    const evil = await http()
      .post('/api/v1/auth/password/forgot')
      .set('origin', 'https://evil.example')
      .send({ email: user.email });
    expect(evil.status).toBe(403);
    const none = await http()
      .post('/api/v1/auth/password/set')
      .send({ token: 'A'.repeat(43), password: PASSWORD });
    expect(none.status).toBe(403);
  });

  it('display names with control or invisible characters are refused', async () => {
    for (const displayName of ['Line\nbreak', 'Right\u202eto-left', 'Zero\u200bwidth', '   ']) {
      await expect(
        app
          .get(UsersService)
          .createWithSetupLink(
            { email: address(), displayName },
            { userId: null, requestId: null, reason: 'test' },
          ),
      ).rejects.toThrow();
    }
    const ok = await app
      .get(UsersService)
      .createWithSetupLink(
        { email: address(), displayName: '  Ana\u0301 Pérez 👩\u200d💻 ' },
        { userId: null, requestId: null, reason: 'test' },
      );
    expect(ok.displayName).toBe('Aná Pérez 👩\u200d💻');
  });
});
