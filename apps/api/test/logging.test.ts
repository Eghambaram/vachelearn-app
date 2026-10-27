import pino from 'pino';
import request from 'supertest';
import { loadConfig } from '../src/config/env';
import { pinoOptions, scrubText } from '../src/logging/logging.module';
import { createTestApp, LogCapture } from './app';

describe('structured logs (secrets never logged)', () => {
  it('logs headers from an allowlist only, never the query string, with ids on the line', async () => {
    const logs = new LogCapture();
    const { app } = await createTestApp({ logs });
    let requestId = '';
    try {
      const res = await request(app.getHttpServer())
        .get('/api/v1/anything?reset=secret-reset-token-123')
        .set('authorization', 'Bearer super-secret-token-abc')
        .set('cookie', 'vl_session=session-secret-xyz')
        .set('referer', 'http://localhost:3000/reset?token=referer-token-456')
        .set('x-api-key', 'api-key-789')
        .set('user-agent', 'vitest-agent')
        .set('x-request-id', 'trace-logs-0001');
      requestId = String(res.headers['x-request-id']);
    } finally {
      await app.close();
    }
    const all = logs.lines.join('\n');
    for (const secret of [
      'super-secret-token-abc',
      'session-secret-xyz',
      'secret-reset-token-123',
      'referer-token-456',
      'api-key-789',
    ]) {
      expect(all).not.toContain(secret);
    }
    const line = logs.records.find((r) => (r.req as { id?: string } | undefined)?.id === requestId);
    expect(line).toBeDefined();
    expect(line!.clientRequestId).toBe('trace-logs-0001');
    const req = line!.req as { url: string; headers: Record<string, string> };
    expect(req.url).toBe('/api/v1/anything');
    expect(req.headers).toEqual({ 'user-agent': 'vitest-agent' });
  });

  it('redacts credential fields at the top level and nested', () => {
    const capture = new LogCapture();
    const config = loadConfig({ ...process.env, LOG_LEVEL: 'info' });
    const logger = pino(pinoOptions(config), capture);
    logger.info(
      { password: 'top-secret-1', body: { user: { token: 'nested-secret-2' } } },
      'event',
    );
    logger.info({ inviteToken: 'invite-secret-3', answers: ['learner-answer-4'] }, 'event');
    const all = capture.lines.join('\n');
    for (const secret of [
      'top-secret-1',
      'nested-secret-2',
      'invite-secret-3',
      'learner-answer-4',
    ]) {
      expect(all).not.toContain(secret);
    }
    expect(capture.records[0]!.password).toBe('[REDACTED]');
  });

  it('scrubs connection-string credentials and key=value secrets from free text', () => {
    expect(scrubText('postgres://user:pass@host/db and redis://:pw@cache')).toBe(
      'postgres://[REDACTED]@host/db and redis://[REDACTED]@cache',
    );
    expect(scrubText('login password=abc123&next=1')).toBe('login password=[REDACTED]&next=1');
  });

  it('does not log successful readiness probes', async () => {
    const logs = new LogCapture();
    const { app } = await createTestApp({ logs });
    try {
      await request(app.getHttpServer()).get('/ready');
    } finally {
      await app.close();
    }
    expect(
      logs.records.some((r) => (r.req as { url?: string } | undefined)?.url === '/ready'),
    ).toBe(false);
  });
});
