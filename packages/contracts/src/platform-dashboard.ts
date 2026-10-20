import { z } from 'zod';
import { BasisPoints, Count, IsoDate, IsoInstant } from './common';

/*
 * GET /api/v1/platform/dashboard?period=… — Platform Super Admin only (`analytics.read` at platform scope).
 * Every number is computed by the server from the metric definitions in docs/METRICS.md; the client only formats.
 * Revenue/subscription figures are absent until D-027 is decided; tenant industry until D-048.
 */

export const DashboardPeriod = z.enum(['30d', '90d', '12m']);
export type DashboardPeriod = z.infer<typeof DashboardPeriod>;

export const PlatformDashboardQuery = z.object({
  period: DashboardPeriod.default('30d'),
});
export type PlatformDashboardQuery = z.infer<typeof PlatformDashboardQuery>;

/** Domain-model tenant statuses (D-066). */
export const TenantStatus = z.enum(['active', 'suspended', 'archived']);
export type TenantStatus = z.infer<typeof TenantStatus>;

/** A count now and at the start of the period, so the change can be shown. */
const CountWithPrevious = z.object({ value: Count, previousValue: Count });

export const PlatformKpis = z.object({
  /** Tenants that exist at `generatedAt`, by status. METRICS.md `platform.tenants`. */
  tenants: z.object({
    byStatus: z.object({ active: Count, suspended: Count, archived: Count }),
    /** Non-archived tenants now, and at the start of the period. */
    current: CountWithPrevious,
  }),
  /** Distinct users with an active learner membership in an active tenant. METRICS.md `platform.learners`. */
  learners: CountWithPrevious,
  /** Courses whose current version is published, in active tenants. METRICS.md `platform.published_courses`. */
  publishedCourses: CountWithPrevious,
  /** D-065: completed ÷ non-cancelled enrollments created in the period. `rate` is null when `enrolled` is 0. */
  completionRate: z.object({ completed: Count, enrolled: Count, rate: BasisPoints.nullable() }),
});
export type PlatformKpis = z.infer<typeof PlatformKpis>;

export const BucketGranularity = z.enum(['week', 'month']);
export type BucketGranularity = z.infer<typeof BucketGranularity>;

export const TenantGrowthPoint = z.object({
  /** First day of the bucket (Monday for weeks), in the platform reporting zone. */
  bucketStart: IsoDate,
  newTenants: Count,
  /** Non-archived tenants at the end of the bucket. */
  totalTenants: Count,
});

export const EnrollmentTrendPoint = z.object({
  bucketStart: IsoDate,
  enrollments: Count,
  completions: Count,
});

export const RecentTenant = z.object({
  id: z.string(),
  displayName: z.string(),
  slug: z.string(),
  status: TenantStatus,
  learnerCount: Count,
  createdAt: IsoInstant,
});
export type RecentTenant = z.infer<typeof RecentTenant>;

/** Audit actions shown in the platform activity feed (AuditEvent `resource.verb_past`). */
export const PlatformActivityAction = z.enum([
  'tenant.created',
  'tenant.suspended',
  'tenant.reactivated',
  'tenant.archived',
  'platform_user.invited',
  'support_session.started',
]);
export type PlatformActivityAction = z.infer<typeof PlatformActivityAction>;

export const PlatformActivity = z.object({
  id: z.string(),
  occurredAt: IsoInstant,
  actorDisplayName: z.string(),
  action: PlatformActivityAction,
  /** The tenant the action concerned, when there is one. */
  tenant: z.object({ id: z.string(), displayName: z.string() }).nullable(),
});
export type PlatformActivity = z.infer<typeof PlatformActivity>;

export const PlatformDashboard = z.object({
  period: DashboardPeriod,
  periodStart: IsoInstant,
  generatedAt: IsoInstant,
  /** Zone the buckets were cut in (the platform reporting zone). */
  timeZone: z.string(),
  kpis: PlatformKpis,
  granularity: BucketGranularity,
  tenantGrowth: z.array(TenantGrowthPoint),
  enrollmentTrend: z.array(EnrollmentTrendPoint),
  /** Newest first, at most 5. */
  recentTenants: z.array(RecentTenant).max(5),
  /** Newest first, at most 8. */
  activity: z.array(PlatformActivity).max(8),
});
export type PlatformDashboard = z.infer<typeof PlatformDashboard>;
