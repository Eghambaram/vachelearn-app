import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma, type Job } from '../../generated/prisma/client';
import type { Tx } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { JobRegistry, PermanentJobError } from './job-handlers';
import { sanitizeJobError } from './sanitize-error';

/*
 * Postgres job/outbox runner (D-040, Confirmed 2026-10-28).
 * - Enqueue in the same transaction as the change that needs the work; `(type, business_key)` is unique, so a repeat
 *   is a no-op (`ON CONFLICT DO NOTHING`).
 * - Claim one due job at a time with `FOR UPDATE SKIP LOCKED`, so two workers (or two API instances) never take the
 *   same job. A job left `running` by a stopped worker is reclaimed once its lease expires.
 * - At most 5 attempts; waits of 30 s doubling per attempt, capped at 1 h. Then `failed`, with a sanitised error.
 * - While a handler runs its lease is renewed every minute, so a slow job is never reclaimed from a live worker; a pass
 *   stops after half a lease and between jobs when the worker is stopping (security review 2.3a).
 * - Logs carry job id, type, attempt and status — never the payload.
 * Time comes from a clock read at each step (tests pass a fixed date); the database clock is never read.
 */

export const MAX_ATTEMPTS = 5;
export const LEASE_MS = 5 * 60_000;
const HEARTBEAT_MS = 60_000;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 60 * 60_000;

/** Wait before the next attempt, after `attempt` attempts have failed (1-based). */
export function retryDelayMs(attempt: number) {
  return Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
}

export type EnqueueInput = {
  type: string;
  businessKey: string;
  tenantId?: string | null;
  payload: Record<string, unknown>;
  runAfter?: Date;
};

type ClaimedRow = { id: string };

/** A fixed date (tests) or a clock read at each step (the worker). */
export type ClockArg = Date | (() => Date);
const clockOf = (arg: ClockArg = () => new Date()) => (typeof arg === 'function' ? arg : () => arg);

/** Ids and safe separators only: a business key is stored and indexed unscrubbed, so no address or token fits. */
const BUSINESS_KEY = /^[A-Za-z0-9:._-]{1,200}$/;

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: JobRegistry,
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(JobsService.name);
  }

  /**
   * Adds a job unless one with the same type and business key exists. Pass the caller's transaction so the job commits
   * (or rolls back) with the change it belongs to. Returns true when a job was created.
   */
  async enqueue(input: EnqueueInput, tx: Tx = this.prisma): Promise<boolean> {
    const handler = this.registry.get(input.type);
    if (!handler) throw new Error(`Unknown job type ${input.type}`);
    if (!BUSINESS_KEY.test(input.businessKey)) {
      throw new Error('A job business key holds ids and [:._-] only (no addresses or tokens)');
    }
    // Validate now, so a bad payload fails the caller's request instead of a job hours later.
    const payload = handler.payload.parse(input.payload) as Prisma.InputJsonValue;
    const { count } = await tx.job.createMany({
      data: [
        {
          type: input.type,
          businessKey: input.businessKey,
          tenantId: input.tenantId ?? null,
          payload,
          maxAttempts: MAX_ATTEMPTS,
          ...(input.runAfter ? { runAfter: input.runAfter } : {}),
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  /**
   * Runs due jobs one by one until none is due, `limit` is reached, half a lease has passed or `shouldStop` says so.
   * Returns how many ran.
   */
  async runDue(
    workerId: string,
    clockArg?: ClockArg,
    { limit = 50, shouldStop = () => false }: { limit?: number; shouldStop?: () => boolean } = {},
  ): Promise<number> {
    const clock = clockOf(clockArg);
    const started = clock().getTime();
    let ran = 0;
    while (
      ran < limit &&
      !shouldStop() &&
      clock().getTime() - started < LEASE_MS / 2 &&
      (await this.runOnce(workerId, clock))
    ) {
      ran++;
    }
    return ran;
  }

  /** Reclaims expired leases, then claims and runs one due job. Returns false when nothing was due. */
  async runOnce(workerId: string, clockArg?: ClockArg, onlyJobId?: string): Promise<boolean> {
    const clock = clockOf(clockArg);
    await this.reclaimExpired(clock());
    const job = await this.claim(workerId, clock(), onlyJobId);
    if (!job) return false;

    const handler = this.registry.get(job.type);
    const heartbeat = setInterval(
      () => void this.renewLease(job.id, workerId, clock()),
      HEARTBEAT_MS,
    );
    try {
      if (!handler) throw new PermanentJobError(`No handler for job type ${job.type}`);
      const parsed = handler.payload.safeParse(job.payload);
      if (!parsed.success) throw new PermanentJobError('Payload does not match the job type');
      await handler.run(parsed.data, job);
      await this.finish(job, workerId, {
        status: 'succeeded',
        completedAt: clock(),
        lastError: null,
      });
      this.log(job, 'succeeded');
    } catch (err) {
      const now = clock();
      const lastError = sanitizeJobError(err);
      const final = err instanceof PermanentJobError || job.attempts >= job.maxAttempts;
      await this.finish(
        job,
        workerId,
        final
          ? { status: 'failed', completedAt: now, lastError }
          : {
              status: 'retrying',
              runAfter: new Date(now.getTime() + retryDelayMs(job.attempts)),
              lastError,
            },
      );
      this.log(job, final ? 'failed' : 'retrying', lastError);
    } finally {
      clearInterval(heartbeat);
    }
    return true;
  }

  /** Keeps a live worker's claim: only while this worker still holds the job. */
  private async renewLease(id: string, workerId: string, now: Date) {
    await this.prisma.job
      .updateMany({ where: { id, status: 'running', lockedBy: workerId }, data: { lockedAt: now } })
      .catch((err: unknown) => this.logger.warn({ err, jobId: id }, 'job lease renewal failed'));
  }

  /** Runs one specific job if it is due (operator commands run only their own work). */
  runJob(workerId: string, jobId: string) {
    return this.runOnce(workerId, undefined, jobId);
  }

  private async claim(workerId: string, now: Date, onlyJobId?: string): Promise<Job | null> {
    const onlyThis = onlyJobId ? Prisma.sql`AND id = ${onlyJobId}::uuid` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<ClaimedRow[]>`
      UPDATE jobs
         SET status = 'running', attempts = attempts + 1, locked_at = ${now}, locked_by = ${workerId},
             updated_at = ${now}
       WHERE id = (
         SELECT id FROM jobs
          WHERE status IN ('queued', 'retrying') AND run_after <= ${now} ${onlyThis}
          ORDER BY run_after, id
          FOR UPDATE SKIP LOCKED
          LIMIT 1)
      RETURNING id`;
    const id = rows[0]?.id;
    return id ? this.prisma.job.findUnique({ where: { id } }) : null;
  }

  /** A `running` job whose lease expired (its worker stopped): retry it, or fail it when no attempts remain. */
  private async reclaimExpired(now: Date) {
    const expiredBefore = new Date(now.getTime() - LEASE_MS);
    const lastError = 'LeaseExpired: the worker stopped before finishing';
    await this.prisma.$executeRaw`
      UPDATE jobs
         SET status = CASE WHEN attempts >= max_attempts THEN 'failed'::"JobStatus" ELSE 'retrying'::"JobStatus" END,
             completed_at = CASE WHEN attempts >= max_attempts THEN ${now}::timestamptz END,
             run_after = ${now}, locked_at = NULL, locked_by = NULL, last_error = ${lastError}, updated_at = ${now}
       WHERE status = 'running' AND locked_at < ${expiredBefore}`;
  }

  /** Records the outcome only while this worker still holds the job (a reclaimed job is not overwritten). */
  private async finish(job: Job, workerId: string, data: Prisma.JobUpdateManyMutationInput) {
    await this.prisma.job.updateMany({
      where: { id: job.id, status: 'running', lockedBy: workerId },
      data: { ...data, lockedAt: null, lockedBy: null },
    });
  }

  private log(job: Job, status: string, error?: string) {
    const fields = { jobId: job.id, jobType: job.type, attempt: job.attempts, status };
    if (status === 'succeeded') this.logger.info(fields, 'job succeeded');
    else this.logger.warn({ ...fields, error }, `job ${status}`);
  }
}
