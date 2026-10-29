import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { SupportSessionsService } from './support-sessions.service';

const SWEEP_MS = 60_000;

/**
 * Closes support sessions that ran out while nobody used them (isolation audit 2.4c): every minute, sessions past
 * their 60 minutes are ended as `expired` and audited, so the tenant's log always shows an end. Runs with the job
 * worker (`JOBS_WORKER`); the per-request check stays the access control.
 */
@Injectable()
export class SupportSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;
  private pass: Promise<unknown> | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly support: SupportSessionsService,
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(SupportSweeper.name);
  }

  onApplicationBootstrap() {
    if (!this.config.jobsWorker) return;
    this.timer = setInterval(() => {
      if (this.pass) return;
      this.pass = this.support
        .sweepExpired()
        .catch((err: unknown) => this.logger.warn({ err }, 'support session sweep failed'))
        .finally(() => {
          this.pass = undefined;
        });
    }, SWEEP_MS);
    this.timer.unref();
  }

  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.pass;
  }
}
