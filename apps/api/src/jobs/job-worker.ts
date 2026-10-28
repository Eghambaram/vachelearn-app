import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { JobsService } from './jobs.service';

const POLL_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;

/** `host:pid:random`, at most 80 characters (the column holds 100; a long container hostname is cut). */
export function workerIdFor(host: string, pid: number) {
  return `${host.slice(0, 60)}:${pid}:${randomUUID().slice(0, 8)}`;
}

/**
 * In-process worker (D-040): polls for due jobs while the API runs (`JOBS_WORKER`, on by default except in tests,
 * which call `JobsService.runDue` directly). One pass at a time. Shutdown stops after the current job. While the
 * database is unreachable it backs off (2 s doubling to 60 s) and logs only the first failure and the recovery.
 */
@Injectable()
export class JobWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  readonly id = workerIdFor(hostname(), process.pid);
  private timer: NodeJS.Timeout | undefined;
  private pass: Promise<void> | undefined;
  private stopping = false;
  private failures = 0;
  private nextPassAt = 0;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jobs: JobsService,
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(JobWorker.name);
  }

  onApplicationBootstrap() {
    if (!this.config.jobsWorker) return;
    this.timer = setInterval(() => this.tick(), POLL_MS);
    this.timer.unref();
    this.logger.info({ workerId: this.id }, 'job worker started');
  }

  async onApplicationShutdown() {
    this.stopping = true;
    clearInterval(this.timer);
    await this.pass;
  }

  private tick() {
    if (this.pass || this.stopping || Date.now() < this.nextPassAt) return;
    this.pass = this.jobs
      .runDue(this.id, undefined, { shouldStop: () => this.stopping })
      .then(() => {
        if (this.failures > 0)
          this.logger.info({ failures: this.failures }, 'job worker recovered');
        this.failures = 0;
      })
      // A database outage must not crash the API: back off, and log once (the serializer scrubs the error).
      .catch((err: unknown) => {
        if (this.failures === 0) this.logger.error({ err }, 'job worker pass failed');
        this.failures++;
        this.nextPassAt = Date.now() + Math.min(POLL_MS * 2 ** this.failures, MAX_BACKOFF_MS);
      })
      .finally(() => {
        this.pass = undefined;
      });
  }
}
