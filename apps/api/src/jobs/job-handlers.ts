import type { z } from 'zod';
import type { Job } from '../../generated/prisma/client';

/*
 * Job types (D-040). Each type names a Zod schema for its payload — checked when the job is enqueued and again when it
 * runs — and a handler. Payloads carry ids and choices, never secrets or message bodies (D-081).
 */

export type JobHandler<S extends z.ZodType = z.ZodType> = {
  type: string;
  payload: S;
  /** Throwing marks the attempt failed (retried with backoff until `maxAttempts`). Must be safe to run again. */
  run(payload: z.output<S>, job: Job): Promise<void>;
};

/** Typed helper so a handler's `run` sees its own payload type. */
export function defineJob<S extends z.ZodType>(handler: JobHandler<S>): JobHandler<S> {
  return handler;
}

/** Registered handlers, filled by each feature module at start-up (email now; notifications, exports later). */
export class JobRegistry {
  private readonly handlers = new Map<string, JobHandler>();

  register(handler: JobHandler) {
    if (this.handlers.has(handler.type))
      throw new Error(`Job type ${handler.type} is already registered`);
    this.handlers.set(handler.type, handler as JobHandler);
  }

  get(type: string): JobHandler | undefined {
    return this.handlers.get(type);
  }
}

/** A failure that retrying cannot fix (bad payload, unknown type): the job fails at once instead of retrying. */
export class PermanentJobError extends Error {
  override name = 'PermanentJobError';
}
