import type { INestApplication } from '@nestjs/common';
import { AuthSessionView, CSRF_HEADER } from '@vachelearn/contracts';
import request from 'supertest';
import type { PrismaClient } from '../generated/prisma/client';
import { createHash } from 'node:crypto';
import { LOGIN_LIMITS } from '../src/auth/auth.service';
import { RateLimitService } from '../src/auth/rate-limit.service';
import { hashPassword } from '../src/auth/passwords';
import { SESSION_COOKIE } from '../src/auth/session-tokens';
import { IDLE_TIMEOUT_MS } from '../src/auth/sessions.service';
import { createTestApp, LogCapture, WEB } from './app';
import { resetDatabase, testPrisma } from './db';

/*
 * Sign-in, sessions and their protections (Slice 2.3b; D-010, D-049, D-084, D-085; spec §5 ACs) through the real
 * application module: the real session resolver, Argon2id, Postgres-backed sessions and rate limits.
 */

const PASSWORD = 'correct horse battery staple';
const logs = new LogCapture();
let app: INestApplication;
let db: PrismaClient;

beforeAll(async () => {
  ({ app } = await createTestApp({ logs }));
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

async function createUser(
  email: string,
  { password = PASSWORD as string | null, verified = true, active = true } = {},
) {
  return db.user.create({
    data: {
      email,
      displayName: 'Asha Rao (Demo)',
      emailVerifiedAt: verified ? new Date() : null,
      ...(active ? {} : { status: 'deactivated', deactivatedAt: new Date() }),
      ...(password
        ? {
            credential: {
              create: { passwordHash: await hashPassword(password), changedAt: new Date() },
            },
          }
        : {}),
    },
  });
}

const login = (email: string, password = PASSWORD) =>
  http().post('/api/v1/auth/login').set('origin', WEB).send({ email, password });

/** Signs in and returns the cookie header to send back, the raw token and the CSRF token. */
async function signIn(email: string) {
  const res = await login(email);
  expect(res.status).toBe(200);
  const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = setCookie.find((c) => c.startsWith(`${SESSION_COOKIE}=`))!;
  const token = cookie.split(';')[0]!.split('=')[1]!;
  return {
    cookie: `${SESSION_COOKIE}=${token}`,
    setCookie: cookie,
    token,
    body: AuthSessionView.parse(res.body),
  };
}

describe('sign-in', () => {
  it('sets a __Host- session cookie (HttpOnly, Secure, SameSite=Lax), stores only its hash, audits it', async () => {
    const user = await createUser('asha@example.test');
    const { setCookie, token, body } = await signIn('ASHA@example.test');
    expect(setCookie).toMatch(/; Path=\//);
    expect(setCookie).toMatch(/; HttpOnly/);
    expect(setCookie).toMatch(/; Secure/);
    expect(setCookie).toMatch(/; SameSite=Lax/);
    expect(setCookie).not.toMatch(/Domain=/i);
    expect(body.user).toEqual({
      id: user.id,
      email: 'asha@example.test',
      displayName: 'Asha Rao (Demo)',
    });
    const session = await db.authSession.findFirstOrThrow();
    expect(session.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(session.tokenHash).not.toContain(token);
    expect(session.expiresAt.getTime() - session.createdAt.getTime()).toBe(7 * 24 * 60 * 60_000);
    expect(
      await db.auditEvent.count({ where: { action: 'auth.signed_in', actorUserId: user.id } }),
    ).toBe(1);
  });

  it('wrong password, unknown email, no password yet, unverified and deactivated all get the same 401', async () => {
    await createUser('right@example.test');
    await createUser('nopassword@example.test', { password: null });
    await createUser('unverified@example.test', { verified: false });
    await createUser('gone@example.test', { active: false });
    const attempts = [
      login('right@example.test', 'not the right password'),
      login('nobody@example.test'),
      login('nopassword@example.test'),
      login('unverified@example.test'),
      login('gone@example.test'),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(401);
      expect(res.body.error).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect',
      });
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    expect(await db.authSession.count()).toBe(0);
  });

  it('an unknown email costs a password verification too (same timing class)', async () => {
    await createUser('right@example.test');
    const time = async (email: string) => {
      const start = performance.now();
      await login(email, 'not the right password');
      return performance.now() - start;
    };
    // Warm up, then compare medians: without the dummy verification an unknown email answers in a few ms.
    await time('right@example.test');
    const median = async (email: string) => {
      const runs = [await time(email), await time(email), await time(email)].sort((a, b) => a - b);
      return runs[1]!;
    };
    const known = await median('right@example.test');
    const unknown = await median('nobody@example.test');
    expect(unknown).toBeGreaterThan(known * 0.5);
  });

  it('is rate-limited per account: the 11th attempt in 15 minutes is 429 with Retry-After', async () => {
    await createUser('target@example.test');
    for (let i = 0; i < LOGIN_LIMITS.account.max; i++) {
      expect((await login('target@example.test', 'wrong password guess')).status).toBe(401);
    }
    const limited = await login('target@example.test');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    // The bucket key is a hash, never the address.
    const keys = (await db.rateLimitBucket.findMany()).map((b) => b.key).join(' ');
    expect(keys).not.toContain('target@example.test');
  });

  it('refuses a body over 4 KB before parsing it (413)', async () => {
    const res = await http()
      .post('/api/v1/auth/login')
      .set('origin', WEB)
      .send({ email: 'a@example.test', password: 'x'.repeat(5_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('never logs the password, the session token or the cookie', async () => {
    await createUser('asha@example.test');
    const { token } = await signIn('asha@example.test');
    await http().get('/api/v1/auth/me').set('cookie', `${SESSION_COOKIE}=${token}`);
    const all = logs.lines.join('\n');
    expect(all).not.toContain(PASSWORD);
    expect(all).not.toContain(token);
  });
});

describe('cross-site protection (D-085)', () => {
  it('a state change from another origin, or with no origin at all, is 403 before anything runs', async () => {
    await createUser('asha@example.test');
    const evil = await http()
      .post('/api/v1/auth/login')
      .set('origin', 'https://evil.example')
      .send({ email: 'asha@example.test', password: PASSWORD });
    expect(evil.status).toBe(403);
    expect(evil.body.error.code).toBe('CROSS_ORIGIN');
    const none = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'asha@example.test', password: PASSWORD });
    expect(none.status).toBe(403);
    // A browser's same-origin fetch without an Origin header is accepted.
    const sameSite = await http()
      .post('/api/v1/auth/login')
      .set('sec-fetch-site', 'same-origin')
      .send({ email: 'asha@example.test', password: PASSWORD });
    expect(sameSite.status).toBe(200);
    expect(await db.authSession.count()).toBe(1);
  });

  it('sign-out needs the session’s CSRF token; another session’s token does not work', async () => {
    await createUser('asha@example.test');
    await createUser('ravi@example.test');
    const asha = await signIn('asha@example.test');
    const ravi = await signIn('ravi@example.test');
    const logout = (cookie: string, csrf?: string) => {
      const req = http().post('/api/v1/auth/logout').set('origin', WEB).set('cookie', cookie);
      return csrf ? req.set(CSRF_HEADER, csrf) : req;
    };
    expect((await logout(asha.cookie)).body.error.code).toBe('CSRF');
    expect((await logout(asha.cookie, ravi.body.csrfToken)).status).toBe(403);
    expect((await logout(asha.cookie, asha.body.csrfToken)).status).toBe(204);
  });
});

describe('the session', () => {
  it('GET /auth/me answers for a live session and 401 without, with a forged or unknown cookie', async () => {
    const user = await createUser('asha@example.test');
    const { cookie, body } = await signIn('asha@example.test');
    const me = await http().get('/api/v1/auth/me').set('cookie', cookie);
    expect(me.status).toBe(200);
    expect(AuthSessionView.parse(me.body)).toMatchObject({
      user: { id: user.id },
      csrfToken: body.csrfToken,
    });
    for (const bad of [
      '',
      `${SESSION_COOKIE}=not-a-token`,
      `${SESSION_COOKIE}=${'A'.repeat(43)}`,
    ]) {
      const res = await http().get('/api/v1/auth/me').set('cookie', bad);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('sign-out ends the session (reason recorded, audited) and clears the cookie', async () => {
    const user = await createUser('asha@example.test');
    const { cookie, body } = await signIn('asha@example.test');
    const res = await http()
      .post('/api/v1/auth/logout')
      .set('origin', WEB)
      .set('cookie', cookie)
      .set(CSRF_HEADER, body.csrfToken);
    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'])).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
    expect(await db.authSession.findFirstOrThrow()).toMatchObject({ endReason: 'signed_out' });
    expect(
      await db.auditEvent.count({ where: { action: 'auth.signed_out', actorUserId: user.id } }),
    ).toBe(1);
    expect((await http().get('/api/v1/auth/me').set('cookie', cookie)).status).toBe(401);
  });

  it('a deactivated user’s sessions stop working on the next request (D-049)', async () => {
    const user = await createUser('asha@example.test');
    const { cookie } = await signIn('asha@example.test');
    await db.user.update({
      where: { id: user.id },
      data: { status: 'deactivated', deactivatedAt: new Date() },
    });
    expect((await http().get('/api/v1/auth/me').set('cookie', cookie)).status).toBe(401);
    expect(await db.authSession.findFirstOrThrow()).toMatchObject({
      endReason: 'user_deactivated',
    });
  });

  it('ends after 8 hours idle or at its 7-day expiry, whichever comes first (D-084)', async () => {
    await createUser('asha@example.test');
    const idle = await signIn('asha@example.test');
    await db.authSession.updateMany({
      data: { lastSeenAt: new Date(Date.now() - IDLE_TIMEOUT_MS - 60_000) },
    });
    expect((await http().get('/api/v1/auth/me').set('cookie', idle.cookie)).status).toBe(401);
    expect(await db.authSession.findFirstOrThrow()).toMatchObject({ endReason: 'idle_timeout' });

    const old = await signIn('asha@example.test');
    await db.authSession.updateMany({
      where: { endedAt: null },
      data: {
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60_000),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    expect((await http().get('/api/v1/auth/me').set('cookie', old.cookie)).status).toBe(401);
    expect(await db.authSession.count({ where: { endReason: 'expired' } })).toBe(1);
  });

  it('a signed-in user without roles still gets 403 on permission routes (memberships arrive in 2.4)', async () => {
    await createUser('asha@example.test');
    const { cookie } = await signIn('asha@example.test');
    expect((await http().get('/api/v1/platform/tenants').set('cookie', cookie)).status).toBe(403);
    expect((await http().get('/api/v1/branches').set('cookie', cookie)).status).toBe(403);
  });
});

describe('security headers', () => {
  it('API responses forbid scripts, framing, sniffing and referrers', async () => {
    const res = await http().get('/health');
    expect(res.headers['content-security-policy']).toBe(
      "default-src 'none';frame-ancestors 'none'",
    );
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['cache-control']).toBe('no-store');
    // HSTS is the production edge's job (scope decided there), never sent by a development API.
    expect(res.headers['strict-transport-security']).toBeUndefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('security review 2.3b fixes', () => {
  it('signing in on a browser that already holds a session ends that session', async () => {
    await createUser('asha@example.test');
    await createUser('ravi@example.test');
    const asha = await signIn('asha@example.test');
    const res = await http()
      .post('/api/v1/auth/login')
      .set('origin', WEB)
      .set('cookie', asha.cookie)
      .send({ email: 'ravi@example.test', password: PASSWORD });
    expect(res.status).toBe(200);
    const sessions = await db.authSession.findMany({ orderBy: { createdAt: 'asc' } });
    expect(sessions.map((x) => x.endReason)).toEqual(['signed_out', null]);
    expect((await http().get('/api/v1/auth/me').set('cookie', asha.cookie)).status).toBe(401);
  });

  it('sign-in and session responses are never cached', async () => {
    await createUser('asha@example.test');
    const res = await login('asha@example.test');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('a form-encoded body is refused (415): state changes accept JSON only', async () => {
    await createUser('asha@example.test');
    const res = await http()
      .post('/api/v1/auth/login')
      .set('origin', WEB)
      .type('form')
      .send(`email=asha%40example.test&password=${encodeURIComponent(PASSWORD)}`);
    expect(res.status).toBe(415);
    expect(await db.authSession.count()).toBe(0);
  });

  it('case variants of one address share its rate-limit bucket', async () => {
    await createUser('target@example.test');
    for (let i = 0; i < LOGIN_LIMITS.account.max; i++) {
      const email = i % 2 ? 'TARGET@example.test' : 'Target@Example.test';
      expect((await login(email, 'wrong password guess')).status).toBe(401);
    }
    expect((await login('target@example.test')).status).toBe(429);
  });

  it('a failed sign-in is logged for alerting, without the address or the password', async () => {
    await createUser('asha@example.test');
    await login('asha@example.test', 'a wrong password here');
    const line = logs.records.find((r) => r.event === 'auth.sign_in_failed');
    expect(line).toMatchObject({ subject: expect.stringMatching(/^[A-Za-z0-9_-]{16}$/) });
    const all = logs.lines.join('\n');
    expect(all).not.toContain('asha@example.test');
    expect(all).not.toContain('a wrong password here');
  });

  it('rate-limit keys are keyed hashes and old counters are pruned', async () => {
    const limits = app.get(RateLimitService);
    await limits.hit(
      { name: 'test-limit', max: 5, windowMs: 60_000 },
      '203.0.113.7',
      new Date('2026-01-01'),
    );
    const [bucket] = await db.rateLimitBucket.findMany();
    expect(bucket!.key).not.toContain(
      createHash('sha256').update('203.0.113.7').digest('base64url').slice(0, 32),
    );
    expect((await limits.prune(new Date('2026-01-03'))).count).toBe(1);
  });
});
