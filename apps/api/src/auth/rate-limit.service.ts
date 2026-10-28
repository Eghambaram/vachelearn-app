import { createHmac } from 'node:crypto';
import { isIPv6 } from 'node:net';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { ApiException } from '../common/errors/api-exception';
import { PrismaService } from '../prisma/prisma.service';

/*
 * Postgres-backed fixed-window rate limits (security review 2.1; no Redis, D-040). One upsert per check: the window
 * restarts when it has elapsed, otherwise the count rises; over the limit → 429 with Retry-After. Keys are HMACs with
 * the server secret, so the table (or a backup) never yields an email address or IP, even by brute force. Rows older
 * than a day are pruned now and then (security review 2.3b).
 */

const PRUNE_AFTER_MS = 24 * 60 * 60_000;
const PRUNE_EVERY = 200;

/**
 * The rate-limit subject for a client address: IPv4 as is, IPv6 by its /64 network — one subscriber line usually holds
 * a whole /64, so per-address limits would be trivial to rotate around. IPv4-mapped IPv6 counts as IPv4.
 */
export function ipSubject(ip: string) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1]!;
  if (!isIPv6(ip)) return ip;
  const [head = '', tail = ''] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::')
    ? [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right]
    : left;
  return `${groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(':')}::/64`;
}

export type Limit = { name: string; max: number; windowMs: number };

type Row = { count: number; window_start: Date };

@Injectable()
export class RateLimitService {
  private hits = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Counts one attempt against `limit` for `subject` (e.g. an email or IP); throws 429 when over the limit. */
  async hit(limit: Limit, subject: string, now = new Date()) {
    const digest = createHmac('sha256', this.config.sessionSecret)
      .update(`${limit.name}:${subject}`)
      .digest('base64url')
      .slice(0, 32);
    const key = `${limit.name}:${digest}`;
    if (++this.hits % PRUNE_EVERY === 0) await this.prune(now);
    const windowStartsAfter = new Date(now.getTime() - limit.windowMs);
    const [row] = await this.prisma.$queryRaw<Row[]>`
      INSERT INTO rate_limit_buckets (key, window_start, count) VALUES (${key}, ${now}, 1)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limit_buckets.window_start <= ${windowStartsAfter} THEN 1
                     ELSE rate_limit_buckets.count + 1 END,
        window_start = CASE WHEN rate_limit_buckets.window_start <= ${windowStartsAfter} THEN ${now}
                            ELSE rate_limit_buckets.window_start END
      RETURNING count, window_start`;
    if (row && row.count > limit.max) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((row.window_start.getTime() + limit.windowMs - now.getTime()) / 1000),
      );
      throw new ApiException(
        429,
        'RATE_LIMITED',
        'Too many attempts. Try again later.',
        undefined,
        {
          'Retry-After': String(retryAfterSeconds),
        },
      );
    }
  }

  /** Deletes counters whose window ended more than a day ago (every limit's window is far shorter). */
  async prune(now = new Date()) {
    const before = new Date(now.getTime() - PRUNE_AFTER_MS);
    return this.prisma.rateLimitBucket.deleteMany({ where: { windowStart: { lt: before } } });
  }
}
