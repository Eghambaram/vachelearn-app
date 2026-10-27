import { z } from 'zod';

/*
 * Probes (no authentication, no tenant data). GET /health: the process is up. GET /ready: the API can serve requests —
 * the database answers. When not ready, /ready returns 503 with the standard error envelope (code `NOT_READY`).
 */

export const HealthResponse = z.object({ status: z.literal('ok') });
export type HealthResponse = z.infer<typeof HealthResponse>;

export const ReadyResponse = z.object({
  status: z.literal('ready'),
  checks: z.object({ database: z.literal('up') }),
});
export type ReadyResponse = z.infer<typeof ReadyResponse>;
