import { Writable } from 'node:stream';
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CONTEXT_RESOLVER, type ContextResolver } from '../src/access/request-context';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { loadConfig, type AppConfig } from '../src/config/env';

/** Captures the API's JSON log lines so tests can assert what is (and is not) logged. */
export class LogCapture extends Writable {
  readonly lines: string[] = [];
  override _write(chunk: Buffer, _encoding: BufferEncoding, done: () => void) {
    this.lines.push(...chunk.toString('utf8').split('\n').filter(Boolean));
    done();
  }
  get records(): Record<string, unknown>[] {
    return this.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  }
}

/**
 * Boots the real application module with `configureApp` (the same setup as `main.ts`) against the test database.
 * Extra controllers exist only in the test, e.g. to exercise validation and unexpected errors.
 */
export async function createTestApp({
  env = {},
  controllers = [],
  logs,
  contextResolver,
}: {
  env?: Record<string, string>;
  controllers?: Type[];
  logs?: LogCapture;
  contextResolver?: ContextResolver;
} = {}): Promise<{ app: INestApplication; config: AppConfig }> {
  const config = loadConfig({ ...process.env, LOG_LEVEL: logs ? 'info' : 'silent', ...env });
  // The production module has no test hook: the test resolver replaces the provider here only.
  const builder = Test.createTestingModule({
    imports: [AppModule.forRoot(config, { logStream: logs })],
    controllers,
  });
  if (contextResolver) builder.overrideProvider(CONTEXT_RESOLVER).useValue(contextResolver);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app, config);
  await app.init();
  return { app, config };
}
