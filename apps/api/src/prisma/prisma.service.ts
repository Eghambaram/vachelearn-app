import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { APP_CONFIG, type AppConfig } from '../config/env';

/** How long a readiness check waits for the database before reporting "not ready". */
const READY_TIMEOUT_MS = 2_000;

/**
 * The single Prisma client (D-005), on the `pg` driver adapter. It connects lazily, so the API still starts — and
 * `/ready` can report 503 — while the database is unavailable.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      adapter: new PrismaPg({
        connectionString: config.DATABASE_URL,
        connectionTimeoutMillis: READY_TIMEOUT_MS,
      }),
    });
  }

  /** True when a trivial query succeeds within the timeout. Never throws. */
  async isReady(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), READY_TIMEOUT_MS);
    });
    try {
      return await Promise.race([this.$queryRaw`SELECT 1`.then(() => true), timeout]);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
