import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Express } from 'express';
import { Logger } from 'nestjs-pino';
import { requestIdMiddleware } from './common/request-id';
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
  (app.getHttpAdapter().getInstance() as Express).disable('x-powered-by');
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
