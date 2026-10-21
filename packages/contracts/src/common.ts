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

/** A snapshot count now and at the start of the selected period, so the change can be shown. */
export const CountWithPrevious = z.object({ value: Count, previousValue: Count });

/** Selected dashboard window, ending now. */
export const DashboardPeriod = z.enum(['30d', '90d', '12m']);
export type DashboardPeriod = z.infer<typeof DashboardPeriod>;

export const BucketGranularity = z.enum(['week', 'month']);
export type BucketGranularity = z.infer<typeof BucketGranularity>;

/** Enrollments created and completed per chart bucket (cancelled excluded). */
export const EnrollmentTrendPoint = z.object({
  bucketStart: IsoDate,
  enrollments: Count,
  completions: Count,
});

/** D-065 completion rate: completed ÷ non-cancelled enrollments created in the period; `rate` null when 0 enrolled. */
export const CompletionRate = z.object({
  completed: Count,
  enrolled: Count,
  rate: BasisPoints.nullable(),
});

/** List `limit`: default 25, max 100 (CLAUDE.md list conventions). */
export const ListLimit = z.coerce.number().int().min(1).max(100).default(25);

/** Opaque cursor from a previous page. Bound to the query it came from; reusing it with other filters is a 422. */
export const Cursor = z.string().min(1).max(512);

/** List envelope: `{ data: [...], page: { nextCursor, limit } }`. */
export function cursorPage<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    page: z.object({ nextCursor: Cursor.nullable(), limit: z.number().int().min(1).max(100) }),
  });
}

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
