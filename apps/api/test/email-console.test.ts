import { maskAddress } from '../src/email/email.provider';
import { JobsService } from '../src/jobs/jobs.service';
import { createTestApp, LogCapture } from './app';
import { resetDatabase, testPrisma } from './db';
import { defineNotice } from './email-fixture';

/*
 * The console email provider (local work without Mailpit). Its own file: nestjs-pino's root logger belongs to the
 * first app a file boots, so log assertions need one app per file (see error-logging.test.ts).
 */

it('logs a masked recipient and the subject, never the body', async () => {
  const db = testPrisma();
  await resetDatabase(db);
  const logs = new LogCapture();
  const { app } = await createTestApp({ env: { EMAIL_PROVIDER: 'console' }, logs });
  try {
    const minted: string[] = [];
    defineNotice(app, minted);
    const jobs = app.get(JobsService);
    await jobs.enqueue({
      type: 'email.test_notice',
      businessKey: 'console',
      payload: { subjectTag: 'console' },
    });
    expect(await jobs.runDue('w1')).toBe(1);
    const line = logs.records.find(
      (r) => typeof r.msg === 'string' && r.msg.includes('console provider'),
    );
    expect(line).toMatchObject({
      to: 'l…@example.test',
      subject: 'Verify your address (Demo) console',
    });
    const logged = logs.lines.join('\n');
    expect(minted).toHaveLength(1);
    expect(logged).not.toContain(minted[0]);
    expect(logged).not.toContain('learner@example.test');
    expect(await db.emailDelivery.findFirstOrThrow()).toMatchObject({
      provider: 'console',
      status: 'sent',
    });
  } finally {
    await app.close();
    await db.$disconnect();
  }
});

it('masks addresses', () => {
  expect(maskAddress('someone@example.com')).toBe('s…@example.com');
  expect(maskAddress('not-an-address')).toBe('…');
});
