import { z } from 'zod';
import { Count, IsoDate, IsoInstant } from './common';
import { EnrollmentDisplayStatus } from './enrollment-status';

/*
 * GET /api/v1/me/dashboard — the signed-in learner's own learning (`enrollment.read` scope O). The API reads only the
 * caller's enrollments in the active tenant; there is no user, tenant or branch parameter. Progress, statuses and
 * certificate state are computed by the server (completion policy D-016, overdue D-054). Omitted until decided or
 * built: recommendations (eligibility/catalogue, D-021/D-046), achievements and announcements (D-043), learning plans
 * (D-025), instructor-led sessions (classroom flag, Phase 5).
 */

/** Integer percent 0–100: required lessons completed ÷ required lessons in the enrolled version (D-016, Proposed). */
export const ProgressPercent = z.number().int().min(0).max(100);

export const ContinueLearningItem = z.object({
  enrollmentId: z.string(),
  courseTitle: z.string(),
  /** The version the learner is enrolled in (pinned; D-011). */
  courseVersion: z.number().int().positive(),
  status: EnrollmentDisplayStatus,
  progressPercent: ProgressPercent,
  /** Where "Continue" resumes, or null before the first lesson is opened. */
  nextLessonTitle: z.string().nullable(),
  dueOn: IsoDate.nullable(),
  lastActivityAt: IsoInstant.nullable(),
});
export type ContinueLearningItem = z.infer<typeof ContinueLearningItem>;

export const DeadlineItem = z.object({
  enrollmentId: z.string(),
  courseTitle: z.string(),
  dueOn: IsoDate,
  status: EnrollmentDisplayStatus,
});
export type DeadlineItem = z.infer<typeof DeadlineItem>;

export const CompletedItem = z.object({
  enrollmentId: z.string(),
  courseTitle: z.string(),
  completedAt: IsoInstant,
  /** Completion and certification are different facts: a course may complete without a certificate. */
  certificate: z.object({ awardId: z.string(), issuedAt: IsoInstant }).nullable(),
});
export type CompletedItem = z.infer<typeof CompletedItem>;

export const LearnerDashboard = z.object({
  generatedAt: IsoInstant,
  /** Tenant default timezone: due dates and "today" are cut in it. */
  timeZone: z.string(),
  learner: z.object({ displayName: z.string() }),
  /** Own active enrollments by display status (cancelled excluded). */
  summary: z.object({
    notStarted: Count,
    inProgress: Count,
    overdue: Count,
    completed: Count,
  }),
  /** Started or overdue-in-progress, most recently active first, at most 4. */
  continueLearning: z.array(ContinueLearningItem).max(4),
  /** Not completed, due within the next 30 days or already overdue, soonest first, at most 5. */
  deadlines: z.array(DeadlineItem).max(5),
  /** Most recent first, at most 3. */
  recentlyCompleted: z.array(CompletedItem).max(3),
});
export type LearnerDashboard = z.infer<typeof LearnerDashboard>;
