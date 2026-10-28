import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../generated/prisma/client';
import { JobsService } from '../src/jobs/jobs.service';
import { createTestApp, LogCapture } from './app';
import { resetDatabase, testPrisma } from './db';
import { defineNotice } from './email-fixture';
import { SmtpEmailProvider } from '../src/email/email.provider';

/*
 * Email jobs against a real SMTP server (Mailpit from infra/docker-compose.yml; CI runs it as a service): one message
 * per job even when the job is retried after sending, a stable Message-ID, and no link, token or address in the job
 * table or the logs (D-081). Every message gets a unique subject, so other mail in the local Mailpit never interferes.
 */

const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:58025';
const SMTP_PORT = process.env.MAILPIT_SMTP_PORT ?? '51025';
const SMTP_ENV = { EMAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT };

type MailpitSearch = { messages: { ID: string; MessageID: string; Subject: string }[] };

async function mailpitSearch(subject: string) {
  const res = await fetch(
    `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`,
  );
  expect(res.ok).toBe(true);
  return ((await res.json()) as MailpitSearch).messages;
}

async function mailpitText(id: string) {
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`);
  return ((await res.json()) as { Text: string }).Text;
}

let db: PrismaClient;
beforeAll(() => {
  db = testPrisma();
});
beforeEach(async () => {
  await resetDatabase(db);
});
afterAll(async () => {
  await db.$disconnect();
});

describe('email over SMTP (Mailpit)', () => {
  const logs = new LogCapture();
  const minted: string[] = [];
  let app: INestApplication;
  let jobs: JobsService;

  beforeAll(async () => {
    ({ app } = await createTestApp({ env: SMTP_ENV, logs }));
    jobs = app.get(JobsService);
    defineNotice(app, minted);
  });
  afterAll(async () => {
    await app.close();
  });

  it('sends one message per job with a stable Message-ID; a retry after sending does not send again', async () => {
    const tag = randomUUID();
    await jobs.enqueue({
      type: 'email.test_notice',
      businessKey: tag,
      payload: { subjectTag: tag },
    });
    expect(await jobs.runDue('w1')).toBe(1);

    const job = await db.job.findFirstOrThrow({ include: { delivery: true } });
    expect(job.status).toBe('succeeded');
    expect(job.delivery).toMatchObject({ status: 'sent', provider: 'smtp', attempts: 1 });
    let messages = await mailpitSearch(tag);
    expect(messages).toHaveLength(1);
    // One Message-ID per attempt (a resend carries a different link).
    expect(messages[0]!.MessageID).toBe(`job-${job.id}.1@vachelearn.invalid`);
    expect(await mailpitText(messages[0]!.ID)).toContain(minted.at(-1));

    // The worker stopped after the SMTP server accepted the message but before the job was marked done.
    await db.job.update({
      where: { id: job.id },
      data: { status: 'retrying', completedAt: null, runAfter: new Date(0) },
    });
    expect(await jobs.runDue('w2')).toBe(1);
    messages = await mailpitSearch(tag);
    expect(messages).toHaveLength(1);
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('succeeded');
  });

  it('no token, link or address reaches the job table, the delivery row or the logs', async () => {
    const tag = randomUUID();
    await jobs.enqueue({
      type: 'email.test_notice',
      businessKey: tag,
      payload: { subjectTag: tag },
    });
    await jobs.runDue('w1');
    const token = minted.at(-1)!;
    const stored = JSON.stringify(await db.job.findMany({ include: { delivery: true } }));
    const logged = logs.lines.join('\n');
    for (const leak of [token, 'learner@example.test', 'https://app.example.test']) {
      expect(stored).not.toContain(leak);
      expect(logged).not.toContain(leak);
    }
  });
});

describe('email when the SMTP server is unreachable', () => {
  const logs = new LogCapture();
  let app: INestApplication;

  beforeAll(async () => {
    // Port 9 (discard) on loopback: nothing listens, so the connection is refused at once.
    ({ app } = await createTestApp({ env: { ...SMTP_ENV, SMTP_PORT: '9' }, logs }));
    defineNotice(app, []);
  });
  afterAll(async () => {
    await app.close();
  });

  it('the job is retried later with a sanitised error; the delivery stays "sending"', async () => {
    const jobs = app.get(JobsService);
    const now = new Date('2026-10-28T09:00:00.000Z');
    await jobs.enqueue({
      type: 'email.test_notice',
      businessKey: 'unreachable',
      payload: { subjectTag: 'unreachable' },
      runAfter: now,
    });
    await jobs.runOnce('w1', now);
    const job = await db.job.findFirstOrThrow({ include: { delivery: true } });
    expect(job.status).toBe('retrying');
    expect(job.runAfter).toEqual(new Date(now.getTime() + 30_000));
    expect(job.lastError).toBeTruthy();
    expect(job.lastError).not.toContain('learner@example.test');
    expect(job.delivery).toMatchObject({ status: 'sending', sentAt: null });
  });
});

describe('transport security', () => {
  it('with requireTLS (always in production) a server without STARTTLS gets no message at all', async () => {
    const provider = new SmtpEmailProvider(
      {
        host: '127.0.0.1',
        port: Number(SMTP_PORT),
        secure: false,
        requireTLS: true,
        auth: undefined,
      },
      'VacheLearn (Demo) <no-reply@vachelearn.invalid>',
    );
    const tag = randomUUID();
    await expect(
      provider.send({
        to: 'learner@example.test',
        subject: `Plain text attempt ${tag}`,
        text: 'must not be sent',
        messageId: `<tls-${tag}@vachelearn.invalid>`,
      }),
    ).rejects.toThrow();
    expect(await mailpitSearch(tag)).toHaveLength(0);
  });
});
