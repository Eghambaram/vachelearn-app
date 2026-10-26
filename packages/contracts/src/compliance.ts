import { z } from 'zod';
import { Count, Cursor, IsoDate, IsoInstant, ListLimit, cursorPage } from './common';

/*
 * Compliance status report (UI spec #29, spec §11). GET /api/v1/reports/compliance?branchId=&courseId=&status=&sort=
 * &direction=&cursor=&limit= (`report.read` + `compliance.read`). Tenant and branch scope come from the session; a
 * `branchId` filter can only narrow that scope, never widen it (D-026: a learner is in scope when any of their
 * branches is). Statuses are computed at read time with `complianceStatus` (D-018) — never stored.
 */

export const ComplianceStatus = z.enum([
  'compliant',
  'due_soon',
  'overdue',
  'not_started',
  'not_applicable',
]);
export type ComplianceStatus = z.infer<typeof ComplianceStatus>;

/** D-018: due within this many days (inclusive), or validity ending within it, is "due soon". */
export const COMPLIANCE_DUE_SOON_DAYS = 30;

/** Whole days from one calendar date to another (both YYYY-MM-DD, no timezone involved). */
function daysFrom(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export type ComplianceInput = {
  /** The requirement applies to this learner (audience: tenant, branch, group or job role). */
  applicable: boolean;
  /** The required course is completed (latest evidence). */
  completed: boolean;
  /** Last day the completion counts (renewal), or null when it never expires. Ignored when not completed. */
  validThrough: string | null;
  /** Due date for a learner who has not complied yet, or null when none is set. */
  dueOn: string | null;
};

/**
 * D-018 (Confirmed). Dates are calendar dates in the tenant timezone and are met through the end of the day, so
 * "due today" and "valid through today" are not overdue.
 *
 * @param today the current calendar date (YYYY-MM-DD) in the tenant timezone — computed by the caller from a clock.
 */
export function complianceStatus(input: ComplianceInput, today: string): ComplianceStatus {
  if (!input.applicable) return 'not_applicable';
  const window = (date: string) => {
    const days = daysFrom(today, date);
    return days < 0 ? 'past' : days <= COMPLIANCE_DUE_SOON_DAYS ? 'soon' : 'later';
  };
  if (input.completed) {
    if (input.validThrough === null) return 'compliant';
    const validity = window(input.validThrough);
    // Expired evidence is kept; the requirement is due again from the day validity ended.
    if (validity === 'past') return 'overdue';
    return validity === 'soon' ? 'due_soon' : 'compliant';
  }
  if (input.dueOn === null) return 'not_started';
  const due = window(input.dueOn);
  return due === 'past' ? 'overdue' : due === 'soon' ? 'due_soon' : 'not_started';
}

/** Severity order used by the default sort: what needs action first. */
export const COMPLIANCE_SEVERITY: readonly ComplianceStatus[] = [
  'overdue',
  'due_soon',
  'not_started',
  'compliant',
  'not_applicable',
];

export const ComplianceSortField = z.enum(['status', 'learner', 'dueOn']);
export type ComplianceSortField = z.infer<typeof ComplianceSortField>;

export const ComplianceReportQuery = z
  .object({
    branchId: z.string().max(64).optional(),
    courseId: z.string().max(64).optional(),
    status: ComplianceStatus.optional(),
    sort: ComplianceSortField.default('status'),
    direction: z.enum(['asc', 'desc']).default('asc'),
    cursor: Cursor.optional(),
    limit: ListLimit,
  })
  .strict();
export type ComplianceReportQuery = z.input<typeof ComplianceReportQuery>;

const Named = z.object({ id: z.string(), name: z.string() });

export const ComplianceReportRow = z.object({
  id: z.string(),
  learnerName: z.string(),
  /** The learner's branches **within the viewer's scope** (D-026); `primary` marks the primary branch. */
  branches: z.array(Named.extend({ primary: z.boolean() })).min(1),
  courseId: z.string(),
  courseTitle: z.string(),
  status: ComplianceStatus,
  dueOn: IsoDate.nullable(),
  completedOn: IsoDate.nullable(),
  validThrough: IsoDate.nullable(),
  progressPercent: z.number().int().min(0).max(100),
});
export type ComplianceReportRow = z.infer<typeof ComplianceReportRow>;

export const ComplianceReport = cursorPage(ComplianceReportRow).extend({
  generatedAt: IsoInstant,
  timeZone: z.string(),
  /** The viewer's scope: null = the whole tenant, otherwise the branches they are limited to. */
  scope: z.object({ tenantName: z.string(), branches: z.array(Named).nullable() }),
  /** The filters the server applied (echoed with names, so the scope banner states exactly what was counted). */
  applied: z.object({
    branch: Named.nullable(),
    course: Named.nullable(),
    status: ComplianceStatus.nullable(),
  }),
  /**
   * `total`: rows matching scope and every filter, across all pages. `byStatus`: counts per status over scope + branch
   * + course (the status filter does not narrow it, so the breakdown stays visible); without a status filter its
   * values sum to `total`.
   */
  totals: z.object({
    total: Count,
    byStatus: z.record(ComplianceStatus, Count),
  }),
});
export type ComplianceReport = z.infer<typeof ComplianceReport>;

/*
 * Phase 5 export (5.3), from the isolation review of 1.5.8: the export request is `ComplianceReportQuery` without
 * `cursor` and `limit`; tenant, scope and actor are snapshotted from the session when the export is requested and
 * re-checked when the job runs and when the file is downloaded; every text cell goes through one CSV escaper that
 * neutralises formula prefixes (=, +, -, @, tab, CR) — learner names and course titles are user-entered.
 */

/** Filter choices the viewer may use: branches in scope and the requirement courses whose audience reaches it. */
export const ComplianceReportOptions = z.object({
  branches: z.array(Named),
  courses: z.array(Named),
});
export type ComplianceReportOptions = z.infer<typeof ComplianceReportOptions>;
