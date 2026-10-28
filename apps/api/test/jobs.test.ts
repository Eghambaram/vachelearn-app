import type { INestApplication } from '@nestjs/common';
import { z } from 'zod';
import type { PrismaClient } from '../generated/prisma/client';
import { defineJob, JobRegistry } from '../src/jobs/job-handlers';
import { JobsService, LEASE_MS, MAX_ATTEMPTS, retryDelayMs } from '../src/jobs/jobs.service';
import { workerIdFor } from '../src/jobs/job-worker';
import { EmailJobs } from '../src/email/email-jobs';
import type { EmailProvider } from '../src/email/email.provider';
import { PrismaService } from '../src/prisma/prisma.service';
import type { AppConfig } from '../src/config/env';
import { sanitizeJobError } from '../src/jobs/sanitize-error';
import { createTestApp, LogCapture } from './app';
import { resetDatabase, testPrisma } from './db';

/*
 * Job/outbox runner (Slice 2.3a, D-040): idempotent enqueue, exclusive claims, retry with backoff, final failure with a
 * sanitised error, lease reclaim. Real Postgres; the clock is passed explicitly, never read from the wall.
 */

const T0 = new Date('2026-10-28T09:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

const logs = new LogCapture();
let app: INestApplication;
let db: PrismaClient;
let jobs: JobsService;

/** What the test handlers did, by job id. */
const runs = new Map<string, number>();
let failWith: (() => Error) | null = null;

beforeAll(async () => {
  ({ app } = await createTestApp({ logs }));
  db = testPrisma();
  jobs = app.get(JobsService);
  const registry = app.get(JobRegistry);
  registry.register(
    defineJob({
      type: 'test.record',
      payload: z.object({ label: z.string() }).strict(),
      run: async (_payload, job) => {
        // Yield, so concurrent workers really overlap.
        await new Promise((resolve) => setTimeout(resolve, 5));
        runs.set(job.id, (runs.get(job.id) ?? 0) + 1);
        if (failWith) throw failWith();
      },
    }),
  );
});
beforeEach(async () => {
  await resetDatabase(db);
  runs.clear();
  failWith = null;
  logs.lines.length = 0;
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const enqueue = (businessKey: string, runAfter = T0) =>
  jobs.enqueue({ type: 'test.record', businessKey, payload: { label: businessKey }, runAfter });

describe('enqueue', () => {
  it('the same type + business key twice is a no-op, also when enqueued concurrently', async () => {
    expect(await enqueue('k1')).toBe(true);
    expect(await enqueue('k1')).toBe(false);
    const results = await Promise.all(Array.from({ length: 8 }, () => enqueue('k2')));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await db.job.count()).toBe(2);
  });

  it('commits or rolls back with the caller’s transaction', async () => {
    await expect(
      db.$transaction(async (tx) => {
        await jobs.enqueue(
          { type: 'test.record', businessKey: 'rolled-back', payload: { label: 'x' } },
          tx,
        );
        throw new Error('the change failed');
      }),
    ).rejects.toThrow('the change failed');
    expect(await db.job.count()).toBe(0);
  });

  it('rejects an unknown type or a payload that does not match the type, before anything is stored', async () => {
    await expect(
      jobs.enqueue({ type: 'test.unknown', businessKey: 'a', payload: {} }),
    ).rejects.toThrow(/Unknown job type/);
    await expect(
      jobs.enqueue({ type: 'test.record', businessKey: 'b', payload: { label: 1 } }),
    ).rejects.toThrow();
    await expect(
      jobs.enqueue({ type: 'test.record', businessKey: 'c', payload: { label: 'x', token: 's' } }),
    ).rejects.toThrow();
    expect(await db.job.count()).toBe(0);
  });
});

describe('running', () => {
  it('runs a due job once and records success; a job that is not yet due waits', async () => {
    await enqueue('now');
    await enqueue('later', at(60_000));
    expect(await jobs.runDue('w1', T0)).toBe(1);
    const done = await db.job.findUniqueOrThrow({
      where: { type_businessKey: { type: 'test.record', businessKey: 'now' } },
    });
    expect(done).toMatchObject({
      status: 'succeeded',
      attempts: 1,
      lockedAt: null,
      lockedBy: null,
    });
    expect(done.completedAt).toEqual(T0);
    expect(await jobs.runDue('w1', T0)).toBe(0);
    expect(await jobs.runDue('w1', at(60_000))).toBe(1);
  });

  it('two workers running at the same time never run the same job', async () => {
    for (let i = 0; i < 20; i++) await enqueue(`job-${i}`);
    const [a, b] = await Promise.all([jobs.runDue('w1', T0), jobs.runDue('w2', T0)]);
    expect(a + b).toBe(20);
    expect([...runs.values()].every((n) => n === 1)).toBe(true);
    expect(runs.size).toBe(20);
  });

  it('retries with 30 s doubling waits, then fails after 5 attempts with a sanitised error', async () => {
    const secret = 'tok_9f8e7d6c5b4a39281706f5e4d3c2b1a0';
    failWith = () =>
      new Error(
        `SMTP said no for learner@example.test; link https://app.example/reset?token=${secret} token=${secret}`,
      );
    await enqueue('flaky');
    let now = T0;
    const waits: number[] = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      expect(await jobs.runOnce('w1', now)).toBe(true);
      const job = await db.job.findFirstOrThrow();
      expect(job.attempts).toBe(attempt);
      if (attempt < MAX_ATTEMPTS) {
        expect(job.status).toBe('retrying');
        waits.push(job.runAfter.getTime() - now.getTime());
        // Not due again before the wait is over.
        expect(await jobs.runOnce('w1', new Date(job.runAfter.getTime() - 1))).toBe(false);
        now = job.runAfter;
      }
    }
    expect(waits).toEqual([30_000, 60_000, 120_000, 240_000]);
    const failed = await db.job.findFirstOrThrow();
    expect(failed.status).toBe('failed');
    expect(failed.completedAt).toEqual(now);
    expect(failed.lastError).toMatch(/^Error: SMTP said no/);
    for (const leak of [secret, 'learner@example.test', 'https://']) {
      expect(failed.lastError).not.toContain(leak);
      expect(logs.lines.join('\n')).not.toContain(leak);
    }
    // The log line names the job, never its payload.
    const line = logs.records.find((r) => r.status === 'failed')!;
    expect(line).toMatchObject({ jobType: 'test.record', attempt: MAX_ATTEMPTS });
    expect(JSON.stringify(line)).not.toContain('flaky');
  });

  it('a payload that no longer matches its type fails at once (no retries)', async () => {
    await enqueue('broken');
    await db.job.updateMany({ data: { payload: { unexpected: true } } });
    await jobs.runOnce('w1', T0);
    const job = await db.job.findFirstOrThrow();
    expect(job).toMatchObject({ status: 'failed', attempts: 1 });
    expect(job.lastError).toMatch(/^PermanentJobError/);
    expect(runs.size).toBe(0);
  });
});

describe('leases', () => {
  async function stall(businessKey: string, attempts: number) {
    await enqueue(businessKey);
    await db.job.updateMany({
      where: { businessKey },
      data: { status: 'running', attempts, lockedAt: T0, lockedBy: 'stopped-worker' },
    });
  }

  it('a job left running by a stopped worker is retried after its 5-minute lease, not before', async () => {
    await stall('stalled', 1);
    expect(await jobs.runOnce('w2', at(LEASE_MS - 1))).toBe(false);
    expect(await jobs.runOnce('w2', at(LEASE_MS + 1))).toBe(true);
    const job = await db.job.findFirstOrThrow();
    expect(job).toMatchObject({ status: 'succeeded', attempts: 2 });
  });

  it('a stalled job with no attempts left fails instead of running again', async () => {
    await stall('exhausted', MAX_ATTEMPTS);
    await jobs.runOnce('w2', at(LEASE_MS + 1));
    const job = await db.job.findFirstOrThrow();
    expect(job).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });
    expect(job.lastError).toMatch(/^LeaseExpired/);
    expect(runs.size).toBe(0);
  });
});

describe('policy', () => {
  it('backoff: 30 s doubling, capped at 1 hour', () => {
    expect([1, 2, 3, 4, 5, 8, 20].map(retryDelayMs)).toEqual([
      30_000, 60_000, 120_000, 240_000, 480_000, 3_600_000, 3_600_000,
    ]);
  });

  it.each([
    [
      'a 22-character base64url token',
      'bad token Zx9_Qw-81LmNoPqRsTuVwX',
      'Zx9_Qw-81LmNoPqRsTuVwX',
    ],
    ['a JSON secret', 'payload {"token":"short1"} refused', 'short1'],
    ['a key: value secret', 'otp: 482913 expired', '482913'],
    ['a link without a scheme', 'see app.example.com/reset/abc123 now', 'abc123'],
    ['a relative reset path', 'GET /verify?t=abc123 failed', 'abc123'],
    ['an address at localhost', 'rcpt a.person@localhost refused', 'a.person@localhost'],
  ])('sanitised errors drop %s', (_label, message, leak) => {
    expect(sanitizeJobError(new Error(message))).not.toContain(leak);
  });

  it('an error name carrying data is reduced to Error', () => {
    const err = new Error('x');
    err.name = 'Failed for someone@example.com';
    expect(sanitizeJobError(err)).toBe('Error: x');
  });

  it('sanitised errors keep the type and drop links, addresses and long opaque strings', () => {
    class SmtpError extends Error {
      override name = 'SmtpError';
    }
    const text = sanitizeJobError(
      new SmtpError(
        '550 rejected a.person@example.co.in at postgres://u:pw@db/x key abcdefghijklmnopqrstuvwxyz012345',
      ),
    );
    expect(text).toBe(
      'SmtpError: 550 rejected [EMAIL] at postgres://[REDACTED]@db/x key [REDACTED]',
    );
    expect(sanitizeJobError('plain string').startsWith('Error: Non-error thrown')).toBe(true);
    expect(sanitizeJobError(new Error('x'.repeat(2_000))).length).toBeLessThanOrEqual(500);
  });
});

describe('database constraints', () => {
  const base = { businessKey: 'c', payload: {} };
  it.each([
    [
      'a running job without a lock',
      'jobs_running_is_locked',
      { type: 'test.record', status: 'running' as const },
    ],
    [
      'more attempts than allowed',
      'jobs_attempts_range',
      { type: 'test.record', attempts: 6, maxAttempts: 5 },
    ],
    [
      'a finished job without completed_at',
      'jobs_finished_has_completed_at',
      { type: 'test.record', status: 'succeeded' as const },
    ],
    ['a type that is not resource.action', 'jobs_type_format', { type: 'Record' }],
  ])('rejects %s (%s)', async (_label, constraint, data) => {
    await expect(db.job.create({ data: { ...base, ...data } })).rejects.toThrow(constraint);
  });

  it('one delivery per job, and "sent" needs sent_at', async () => {
    await enqueue('d');
    const job = await db.job.findFirstOrThrow();
    await db.emailDelivery.create({ data: { jobId: job.id, messageId: '<m>', provider: 'smtp' } });
    await expect(
      db.emailDelivery.create({ data: { jobId: job.id, messageId: '<m2>', provider: 'smtp' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      db.emailDelivery.update({ where: { jobId: job.id }, data: { status: 'sent' } }),
    ).rejects.toThrow('email_deliveries_sent_has_sent_at');
  });
});

describe('security review 2.3a fixes', () => {
  it('each job is stamped with the clock at the moment it is claimed or fails, not the pass start', async () => {
    failWith = () => new Error('temporary');
    await enqueue('a');
    await enqueue('b');
    let now = T0.getTime();
    // Every read of the clock moves it 10 s on, as a slow pass would.
    const clock = () => new Date((now += 10_000));
    await jobs.runDue('w1', clock);
    const rows = await db.job.findMany({ orderBy: { businessKey: 'asc' } });
    expect(rows.map((r) => r.status)).toEqual(['retrying', 'retrying']);
    // Job b failed later than job a, so it is due later; neither is stamped with the pass start.
    expect(rows[1]!.runAfter.getTime()).toBeGreaterThan(rows[0]!.runAfter.getTime());
    expect(rows[0]!.runAfter.getTime()).toBeGreaterThan(T0.getTime() + 30_000);
  });

  it('a pass stops after half a lease, and between jobs when the worker is stopping', async () => {
    for (const key of ['a', 'b', 'c']) await enqueue(key);
    let now = T0.getTime();
    const slowClock = () => new Date((now += LEASE_MS / 4));
    expect(await jobs.runDue('w1', slowClock)).toBeLessThan(3);

    await resetDatabase(db);
    for (const key of ['a', 'b', 'c']) await enqueue(key);
    let stop = false;
    failWith = () => {
      stop = true; // the shutdown arrives while the first job runs
      return new Error('first job');
    };
    expect(await jobs.runDue('w1', T0, { shouldStop: () => stop })).toBe(1);
  });

  it('a business key holds ids only: no address, space or token-like free text', async () => {
    for (const key of ['user@example.test', 'reset for user', '']) {
      await expect(
        jobs.enqueue({ type: 'test.record', businessKey: key, payload: { label: 'x' } }),
      ).rejects.toThrow(/business key/);
    }
    expect(await enqueue('reset:01900000-0000-7000-8000-000000000001')).toBe(true);
  });

  it('a worker id fits its column even with a very long host name', () => {
    expect(workerIdFor('h'.repeat(200), 123456).length).toBeLessThanOrEqual(80);
  });

  it('an SMTP 5xx rejection fails the email job at once (no retries, no new token per retry)', async () => {
    const registry = new JobRegistry();
    const refusing: EmailProvider = {
      name: 'smtp',
      send: async () => {
        throw Object.assign(new Error('550 mailbox unavailable'), { responseCode: 550 });
      },
    };
    let composed = 0;
    const config = {
      email: { from: 'VacheLearn (Demo) <no-reply@vachelearn.invalid>' },
    } as AppConfig;
    new EmailJobs(config, refusing, app.get(PrismaService), registry).define({
      type: 'email.refused_test',
      payload: z.object({}).strict(),
      compose: async () => {
        composed++;
        return { to: 'learner@example.test', subject: 'Refused (Demo)', text: 'x' };
      },
    });
    await enqueue('holder');
    const job = await db.job.findFirstOrThrow();
    await expect(registry.get('email.refused_test')!.run({}, job)).rejects.toThrow(
      'SMTP rejected the message (550)',
    );
    expect(composed).toBe(1);
  });
});
