import request from 'supertest';
import { HealthResponse, ReadyResponse } from '@vachelearn/contracts';
import { createTestApp } from './app';

describe('/health and /ready', () => {
  it('both answer when the database is up', async () => {
    const { app } = await createTestApp();
    try {
      const health = await request(app.getHttpServer()).get('/health');
      expect(health.status).toBe(200);
      HealthResponse.parse(health.body);
      const ready = await request(app.getHttpServer()).get('/ready');
      expect(ready.status).toBe(200);
      expect(ReadyResponse.parse(ready.body)).toEqual({
        status: 'ready',
        checks: { database: 'up' },
      });
    } finally {
      await app.close();
    }
  });

  it('/ready is 503 NOT_READY when the database cannot be reached; /health stays 200', async () => {
    // Nothing listens on port 1: the connection is refused, as when Postgres is down.
    const { app } = await createTestApp({
      env: { DATABASE_URL: 'postgresql://vachelearn:change-me@127.0.0.1:1/vachelearn_test' },
    });
    try {
      const ready = await request(app.getHttpServer()).get('/ready');
      expect(ready.status).toBe(503);
      expect(ready.body.error.code).toBe('NOT_READY');
      expect((await request(app.getHttpServer()).get('/health')).status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('probes are not under /api/v1', async () => {
    const { app } = await createTestApp();
    try {
      expect((await request(app.getHttpServer()).get('/api/v1/health')).status).toBe(404);
    } finally {
      await app.close();
    }
  });
});
