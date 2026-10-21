import { z } from 'zod';
import {
  BucketGranularity,
  CompletionRate,
  Count,
  CountWithPrevious,
  DashboardPeriod,
  EnrollmentTrendPoint,
  IsoDate,
  IsoInstant,
} from './common';

/*
 * GET /api/v1/dashboard?period=… — tenant workspace dashboard for Tenant Admin, Branch Admin, Learning Manager and
 * Compliance Viewer (`report.read`). The tenant and the branch scope come from the authenticated session; the request
 * carries neither, and the response says which scope it was computed for. Definitions: docs/METRICS.md (tenant.*).
 * Compliance figures are absent until Phase 5 (D-018).
 */

export const TenantDashboardQuery = z.object({
  period: DashboardPeriod.default('30d'),
});
export type TenantDashboardQuery = z.infer<typeof TenantDashboardQuery>;

/** What the numbers cover: the whole tenant, or the actor's branches (D-026). */
export const DashboardScope = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tenant') }),
  z.object({
    kind: z.literal('branches'),
    branches: z.array(z.object({ id: z.string(), name: z.string() })).min(1),
  }),
]);
export type DashboardScope = z.infer<typeof DashboardScope>;

export const UpcomingDeadline = z.object({
  courseId: z.string(),
  courseTitle: z.string(),
  /** Calendar due date in the tenant timezone. */
  dueOn: IsoDate,
  /** Learners in scope with this due date who have not completed (D-054: not yet overdue). */
  learnersOutstanding: Count,
});
export type UpcomingDeadline = z.infer<typeof UpcomingDeadline>;

export const TenantActivityAction = z.enum([
  'membership.activated',
  'course.published',
  'enrollment.completed',
  'certificate.issued',
  'group.created',
  'assignment.created',
]);
export type TenantActivityAction = z.infer<typeof TenantActivityAction>;

export const TenantActivity = z.object({
  id: z.string(),
  occurredAt: IsoInstant,
  actorDisplayName: z.string(),
  action: TenantActivityAction,
  /** What the action concerned, already a display name (course title, group name, learner name). */
  subject: z.string(),
});
export type TenantActivity = z.infer<typeof TenantActivity>;

export const TenantDashboard = z.object({
  period: DashboardPeriod,
  periodStart: IsoInstant,
  generatedAt: IsoInstant,
  /** The tenant's default timezone: buckets, due dates and "overdue" are cut in it. */
  timeZone: z.string(),
  scope: DashboardScope,
  kpis: z.object({
    /** METRICS.md `tenant.learners` (in scope). */
    learners: CountWithPrevious,
    /** METRICS.md `tenant.published_courses` (organisation-wide; courses are not branch-owned). */
    publishedCourses: CountWithPrevious,
    /** D-065, in scope. */
    completionRate: CompletionRate,
    /** D-054: enrollments past their due date, not completed or cancelled, in scope, now. */
    overdueEnrollments: Count,
  }),
  granularity: BucketGranularity,
  learningProgress: z.array(EnrollmentTrendPoint),
  /** Due in the next 30 days, soonest first, at most 5. */
  upcomingDeadlines: z.array(UpcomingDeadline).max(5),
  /** Newest first, at most 8, in scope. */
  activity: z.array(TenantActivity).max(8),
});
export type TenantDashboard = z.infer<typeof TenantDashboard>;
