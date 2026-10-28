import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Express } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { requestIdMiddleware, requestIdOf } from './common/request-id';
import type { AppConfig } from './config/env';

/** Every API route lives under this prefix; the probes do not. */
export const API_PREFIX = 'api/v1';
export const DOCS_PATH = 'api/docs';

/**
 * HTTP setup shared by `main.ts` and the integration tests, so the tests exercise exactly what runs: request IDs,
 * structured logging, the /api/v1 prefix, CORS for the web origin only, and OpenAPI outside production.
 */
export function configureApp(app: INestApplication, config: AppConfig) {
  app.useLogger(app.get(Logger));
  app.use(requestIdMiddleware);
  const express = app.getHttpAdapter().getInstance() as Express;
  express.disable('x-powered-by');
  // Client IP for rate limits: trust exactly the configured number of proxies, never `true` (security review 2.1).
  express.set('trust proxy', config.trustProxyHops);
  // Security headers. The API serves JSON only, so nothing may run in, frame or cache it; the docs page (never in
  // production) gets its own policy so Swagger UI can load. HSTS only in production: the edge owns its scope (D-085).
  const common = {
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: config.NODE_ENV === 'production' ? { maxAge: 31_536_000 } : false,
  } as const;
  const docsHeaders = helmet({
    ...common,
    contentSecurityPolicy: { directives: { 'frame-ancestors': ["'none'"] } },
  });
  const apiHeaders = helmet({
    ...common,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { 'default-src': ["'none'"], 'frame-ancestors': ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  });
  app.use((req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    const path = (req.url ?? '').toLowerCase();
    if (path === `/${DOCS_PATH}` || path.startsWith(`/${DOCS_PATH}`))
      return docsHeaders(req, res, next);
    // Responses carry session data and CSRF tokens: never stored by a browser or shared cache.
    res.setHeader('Cache-Control', 'no-store');
    return apiHeaders(req, res, next);
  });
  app.use(`/${API_PREFIX}/auth`, authBodyLimit);
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health', 'ready'] });
  // Answer only the web origin: other origins get no CORS headers at all (not a mismatched allow-origin).
  app.enableCors({
    origin: (origin: string | undefined, done: (err: Error | null, allow?: boolean) => void) =>
      done(null, origin === config.WEB_ORIGIN),
    credentials: true,
  });
  app.enableShutdownHooks();

  // Explicit opt-in (development by default, never production): a deploy that forgets NODE_ENV publishes nothing.
  if (config.apiDocs) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('VacheLearn API')
        .setDescription(
          'REST API (/api/v1). Errors use the shared envelope { error: { code, message, requestId } }.',
        )
        .setVersion('0.1.0')
        .build(),
    );
    SwaggerModule.setup(DOCS_PATH, app, document);
  }
}

const AUTH_BODY_LIMIT = 4_096;

/** Sign-in routes take a few short fields: refuse anything bigger before it is parsed (security review 2.1). */
function authBodyLimit(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const length = Number(req.headers['content-length'] ?? 0);
  if (length > AUTH_BODY_LIMIT || req.headers['transfer-encoding'] !== undefined) {
    res.statusCode = 413;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request body too large',
          requestId: requestIdOf(req),
        },
      }),
    );
    return;
  }
  next();
}
