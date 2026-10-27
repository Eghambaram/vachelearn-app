import { Controller, Get } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, LogCapture } from './app';

// Its own file on purpose: nestjs-pino keeps a module-level root logger, so in a file that boots several apps, the
// exception filter's log line can land in an earlier app's capture. One app per file keeps the assertion honest.

/** A route that fails the way a database driver does: the secret material is in properties, not the message. */
@Controller('test-log')
class FailingController {
  @Get('db-error')
  dbError(): never {
    const err = new Error(
      'connect failed for postgresql://vachelearn:pw-in-message@db.internal:5432/x password=pw-in-text',
    ) as Error & { detail: string; code: string };
    err.detail = 'Key (email)=(person@example.com) already exists.';
    err.code = '23505';
    (err as { cause?: unknown }).cause = {
      connectionString: 'postgresql://u:pw-in-cause@db.internal/x',
    };
    throw err;
  }
}

describe('error logging', () => {
  it('an unexpected error is logged as type, code, scrubbed message and stack — never its detail or cause', async () => {
    const logs = new LogCapture();
    const { app } = await createTestApp({ logs, controllers: [FailingController] });
    try {
      const res = await request(app.getHttpServer()).get('/api/v1/test-log/db-error');
      expect(res.status).toBe(500);
    } finally {
      await app.close();
    }
    const all = logs.lines.join('\n');
    for (const secret of ['pw-in-message', 'pw-in-text', 'pw-in-cause', 'person@example.com']) {
      expect(all).not.toContain(secret);
    }
    const line = logs.records.find((r) => r.msg === 'Unhandled error');
    expect(line?.err).toMatchObject({ type: 'Error', code: '23505' });
    expect((line?.err as { message: string }).message).toContain(
      'postgresql://[REDACTED]@db.internal',
    );
  });
});
