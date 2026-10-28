import request from 'supertest';
import { ConfigError, loadConfig } from '../src/config/env';
import { createTestApp } from './app';

const BASE = { NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost/x' } as const;
const PROD = {
  ...BASE,
  NODE_ENV: 'production',
  CURSOR_SECRET: 'k'.repeat(32),
  SESSION_SECRET: 's'.repeat(32),
  TRUST_PROXY_HOPS: '1',
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  EMAIL_FROM: 'VacheLearn <no-reply@mail.vachelearn.test>',
} as const;

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
    expect(loadConfig({ ...PROD, WEB_ORIGIN: 'https://app.example.com' }).WEB_ORIGIN).toBe(
      'https://app.example.com',
    );
  });

  it('CURSOR_SECRET: required and real in production, random per process elsewhere', () => {
    const prod = { ...PROD, CURSOR_SECRET: undefined, WEB_ORIGIN: 'https://a.example' };
    expect(() => loadConfig(prod)).toThrow(/CURSOR_SECRET is required in production/);
    expect(() => loadConfig({ ...prod, CURSOR_SECRET: 'short' })).toThrow(/at least 32/);
    expect(() =>
      loadConfig({ ...prod, CURSOR_SECRET: 'replace-with-a-long-random-value-0123456789' }),
    ).toThrow(/placeholder/);
    expect(loadConfig({ ...prod, CURSOR_SECRET: 'k'.repeat(32) }).cursorSecret).toBe(
      'k'.repeat(32),
    );
    const a = loadConfig(BASE).cursorSecret;
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(loadConfig(BASE).cursorSecret).not.toBe(a);
  });

  it('email: smtp needs host and port; production refuses console and needs a sender', () => {
    expect(loadConfig(BASE).email).toMatchObject({ provider: 'console', smtp: null });
    expect(() => loadConfig({ ...BASE, EMAIL_PROVIDER: 'smtp' })).toThrow(/SMTP_HOST is required/);
    expect(() =>
      loadConfig({
        ...BASE,
        EMAIL_PROVIDER: 'smtp',
        SMTP_HOST: 'h',
        SMTP_PORT: '25',
        SMTP_USER: 'u',
      }),
    ).toThrow(/SMTP_USER and SMTP_PASSWORD must be set together/);
    const prod = { ...PROD, WEB_ORIGIN: 'https://a.example' };
    expect(() => loadConfig({ ...prod, EMAIL_PROVIDER: 'console' })).toThrow(
      /EMAIL_PROVIDER must be smtp in production/,
    );
    expect(() => loadConfig({ ...prod, EMAIL_FROM: undefined })).toThrow(
      /EMAIL_FROM is required in production/,
    );
    expect(loadConfig(prod).email.smtp).toEqual({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: undefined,
    });
    expect(loadConfig({ ...prod, SMTP_SECURE: 'true' }).email.smtp?.requireTLS).toBe(false);
    expect(
      loadConfig({ ...BASE, EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'h', SMTP_PORT: '25' }).email.smtp
        ?.requireTLS,
    ).toBe(false);
    for (const from of ['VacheLearn <no-reply@example.invalid>', 'no-reply@example.com']) {
      expect(() => loadConfig({ ...prod, EMAIL_FROM: from })).toThrow(
        /EMAIL_FROM is still a placeholder/,
      );
    }
  });

  it('TRUST_PROXY_HOPS: required and at least 1 in production (D-085: the peer is the web server)', () => {
    const prod = { ...PROD, WEB_ORIGIN: 'https://a.example' };
    expect(() => loadConfig({ ...prod, TRUST_PROXY_HOPS: undefined })).toThrow(
      /TRUST_PROXY_HOPS is required/,
    );
    expect(() => loadConfig({ ...prod, TRUST_PROXY_HOPS: '0' })).toThrow(
      /at least 1 in production/,
    );
    expect(loadConfig({ ...prod, TRUST_PROXY_HOPS: '2' }).trustProxyHops).toBe(2);
    expect(loadConfig(BASE).trustProxyHops).toBe(0);
  });

  it('job worker: on by default, off in tests, explicit setting wins', () => {
    expect(loadConfig({ ...BASE, NODE_ENV: 'development' }).jobsWorker).toBe(true);
    expect(loadConfig(BASE).jobsWorker).toBe(false);
    expect(loadConfig({ ...BASE, JOBS_WORKER: 'true' }).jobsWorker).toBe(true);
  });

  it('an empty value (NAME= as in .env.example) means "not set"', () => {
    const config = loadConfig({
      ...BASE,
      NODE_ENV: 'development',
      ENABLE_API_DOCS: '',
      CURSOR_SECRET: '',
      WEB_ORIGIN: '',
      JOBS_WORKER: '',
    });
    expect(config.apiDocs).toBe(true);
    expect(config.WEB_ORIGIN).toBe('http://localhost:3000');
    expect(config.cursorSecret.length).toBeGreaterThanOrEqual(32);
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
        ...PROD,
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
      // The docs page has its own policy, so Swagger UI can load its scripts and styles.
      const page = await request(app.getHttpServer()).get('/api/docs/');
      expect(page.headers['content-security-policy']).toContain("script-src 'self'");
      expect(page.headers['content-security-policy']).toContain("frame-ancestors 'none'");
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
      {
        ...PROD,
        DATABASE_URL: process.env.DATABASE_URL!,
        WEB_ORIGIN: 'https://app.example.com',
        JOBS_WORKER: 'false',
      },
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
