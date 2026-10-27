import request from 'supertest';
import { ConfigError, loadConfig } from '../src/config/env';
import { createTestApp } from './app';

const BASE = { NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost/x' } as const;

describe('configuration (fail fast, nothing fails open)', () => {
  it('names every missing or malformed variable, never its value', () => {
    let error: unknown;
    try {
      loadConfig({
        API_PORT: 'not-a-port',
        DATABASE_URL: 'mysql://user:hunter2@db/x',
        NODE_ENV: 'staging',
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as Error).message;
    expect(message).toMatch(/API_PORT/);
    expect(message).toMatch(/DATABASE_URL must be a postgresql:\/\/ URL/);
    expect(message).toMatch(/NODE_ENV must be development, test or production/);
    expect(message).not.toContain('hunter2');
  });

  it('NODE_ENV and DATABASE_URL are required; defaults fill the rest', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://localhost/x' })).toThrow(/NODE_ENV/);
    expect(() => loadConfig({ NODE_ENV: 'development' })).toThrow(/DATABASE_URL is required/);
    expect(loadConfig(BASE)).toMatchObject({
      API_PORT: 4000,
      LOG_LEVEL: 'info',
      WEB_ORIGIN: 'http://localhost:3000',
      apiDocs: false,
    });
  });

  it('WEB_ORIGIN must be a bare origin, and https and explicit in production', () => {
    expect(() => loadConfig({ ...BASE, WEB_ORIGIN: 'http://localhost:3000/' })).toThrow(
      /bare origin/,
    );
    expect(() => loadConfig({ ...BASE, WEB_ORIGIN: 'https://app.example.com/login' })).toThrow(
      /bare origin/,
    );
    expect(() => loadConfig({ ...BASE, NODE_ENV: 'production' })).toThrow(
      /WEB_ORIGIN is required in production/,
    );
    expect(() =>
      loadConfig({ ...BASE, NODE_ENV: 'production', WEB_ORIGIN: 'http://app.example.com' }),
    ).toThrow(/must be https in production/);
    expect(
      loadConfig({ ...BASE, NODE_ENV: 'production', WEB_ORIGIN: 'https://app.example.com' })
        .WEB_ORIGIN,
    ).toBe('https://app.example.com');
  });

  it('API docs: on in development, off elsewhere unless opted in, never in production', () => {
    expect(loadConfig({ ...BASE, NODE_ENV: 'development' }).apiDocs).toBe(true);
    expect(loadConfig({ ...BASE, NODE_ENV: 'development', ENABLE_API_DOCS: 'false' }).apiDocs).toBe(
      false,
    );
    expect(loadConfig({ ...BASE, ENABLE_API_DOCS: 'true' }).apiDocs).toBe(true);
    expect(() =>
      loadConfig({
        ...BASE,
        NODE_ENV: 'production',
        WEB_ORIGIN: 'https://a.example',
        ENABLE_API_DOCS: 'true',
      }),
    ).toThrow(/ENABLE_API_DOCS cannot be enabled in production/);
  });
});

describe('OpenAPI documents', () => {
  it('are served in development, generated from the Zod contracts', async () => {
    const { app } = await createTestApp({ env: { NODE_ENV: 'development' } });
    try {
      const spec = await request(app.getHttpServer()).get('/api/docs-json');
      expect(spec.status).toBe(200);
      expect(spec.body.info.title).toBe('VacheLearn API');
      const ready = spec.body.paths['/ready'].get.responses['200'];
      expect(ready.content['application/json'].schema.properties.status).toEqual({
        type: 'string',
        enum: ['ready'],
      });
    } finally {
      await app.close();
    }
  });

  it('are not served in production, nor by default in any other environment', async () => {
    const envs: Record<string, string>[] = [
      { NODE_ENV: 'production', WEB_ORIGIN: 'https://app.example.com' },
      { NODE_ENV: 'test' },
    ];
    for (const env of envs) {
      const { app } = await createTestApp({ env });
      try {
        expect((await request(app.getHttpServer()).get('/api/docs')).status).toBe(404);
        expect((await request(app.getHttpServer()).get('/api/docs-json')).status).toBe(404);
      } finally {
        await app.close();
      }
    }
  });
});

describe('CORS', () => {
  it('allows only the configured web origin, with credentials', async () => {
    const { app } = await createTestApp({ env: { WEB_ORIGIN: 'http://localhost:3000' } });
    try {
      const allowed = await request(app.getHttpServer())
        .get('/health')
        .set('origin', 'http://localhost:3000');
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(allowed.headers['access-control-allow-credentials']).toBe('true');
      const other = await request(app.getHttpServer())
        .get('/health')
        .set('origin', 'https://evil.example');
      expect(other.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
