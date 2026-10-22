import { z } from 'zod';

/*
 * Enrollment status (domain model). Stored lifecycle: not_started → in_progress → completed, or cancelled.
 * "Overdue" is never stored: it is derived at read time (D-054, Proposed) so reports, dashboards and reminders agree
 * by construction. Pure functions here are shared by the web (demo layer) and the API (Phase 4).
 */

export const EnrollmentLifecycle = z.enum(['not_started', 'in_progress', 'completed', 'cancelled']);
export type EnrollmentLifecycle = z.infer<typeof EnrollmentLifecycle>;

/** What a learner or manager sees. */
export const EnrollmentDisplayStatus = z.enum([
  'not_started',
  'in_progress',
  'overdue',
  'completed',
  'cancelled',
]);
export type EnrollmentDisplayStatus = z.infer<typeof EnrollmentDisplayStatus>;

/**
 * D-054: an enrollment is overdue when it is not completed or cancelled and its due date has passed in the tenant's
 * timezone. A due date is a calendar date and is met through the end of that day, so "due today" is not overdue.
 *
 * @param today the current calendar date (YYYY-MM-DD) in the tenant timezone — computed by the caller from a clock.
 */
export function enrollmentDisplayStatus(
  status: EnrollmentLifecycle,
  dueOn: string | null,
  today: string,
): EnrollmentDisplayStatus {
  if (status === 'completed' || status === 'cancelled') return status;
  // ISO dates compare correctly as strings.
  if (dueOn !== null && dueOn < today) return 'overdue';
  return status;
}
