import { z } from 'zod';

/*
 * Conventions shared by every API contract (CLAUDE.md): UTC instants in storage and on the wire, calendar dates as
 * YYYY-MM-DD, counts as non-negative integers, rates as integer basis points (never floats), and one error envelope.
 */

/** An instant in UTC, ISO 8601 with a `Z` offset, e.g. "2026-10-20T09:30:00.000Z". */
export const IsoInstant = z.iso.datetime();

/** A calendar date with no time or zone, e.g. a due date or a chart bucket start. */
export const IsoDate = z.iso.date();

export const Count = z.number().int().nonnegative();

/** A ratio as integer basis points: 7350 = 73.50%. */
export const BasisPoints = z.number().int().min(0).max(10_000);

/** Error envelope for every non-2xx response: 401, 403, 404 (hidden or missing), 409, 422, 5xx. */
export const ApiErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    fieldErrors: z
      .array(z.object({ field: z.string(), code: z.string(), message: z.string() }))
      .optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
