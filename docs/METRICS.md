# Metric dictionary

Started in Phase 1 Slice 1.5.1 for the metrics the demo dashboards show; completed in Phase 6.4 (`prompts/phase-6-
commerce-analytics.md`). Spec §15: every metric states numerator, denominator, filters, exclusions, time window,
timezone, refresh expectation and where it is computed. A dashboard may show a metric only if it is defined here.

Status follows `docs/DECISIONS.md`. Until Phase 2+ builds the queries, "Computed in" names the planned location; the
Phase 1 demo values come from `apps/web/src/mocks/` and are labelled Demo.

Conventions: instants stored in UTC; buckets and "today" are cut in the **platform reporting zone** `Asia/Kolkata`
(D-034) for platform metrics and in the tenant's default timezone for tenant metrics. Rates are integer basis points
(7350 = 73.50%), displayed with one decimal place. A rate with a zero denominator is "no data", never 0%.

## Platform metrics (Platform Super Admin, `analytics.read` at platform scope)

| Key | Definition | Numerator / value | Denominator | Filters and exclusions | Window | Status |
|---|---|---|---|---|---|---|
| `platform.tenants` | Tenants by status | Count of tenants per status `active` / `suspended` / `archived` (D-066) | — | Headline "current" = active + suspended (archived excluded) | Snapshot at generation time; "previous" = snapshot at period start | Proposed |
| `platform.learners` | Learners on the platform | Distinct users with ≥ 1 `active` membership holding the Learner role in an `active` tenant | — | Deactivated memberships, suspended/archived tenants excluded; a user in two tenants counts once | Snapshot at generation time; "previous" at period start | Proposed |
| `platform.published_courses` | Published courses | Courses whose current version is `published` | — | Courses in suspended/archived tenants excluded; archived courses excluded | Snapshot; "previous" at period start | Proposed |
| `platform.completion_rate` | Completion rate (D-065) | Enrollments with status `completed` | All enrollments except `cancelled` | Enrollments **created in the period**, in active tenants; status read at generation time | Selected period (30 days / 90 days / 12 months, ending now) | **Confirmed** (D-065) |
| `platform.tenant_growth` | New tenants per bucket; non-archived total at bucket end | Tenants created in the bucket | — | — | Weekly buckets (Monday start) for 30/90 days; monthly for 12 months | Proposed |
| `platform.enrollment_trend` | Enrollments and completions per bucket | Enrollments created in the bucket; enrollments completed in the bucket | — | Cancelled enrollments excluded from both | As tenant growth | Proposed |

## Tenant metrics (Tenant Admin, Branch Admin, Learning Manager, Compliance Viewer — `report.read`)

Scope comes from the session: the whole tenant, or the actor's branches. Branch scope follows D-026 (Proposed): a
learner or enrollment is in scope if **any** of the learner's branches is in scope. Times and due dates use the
tenant's default timezone.

| Key | Definition | Numerator / value | Denominator | Filters and exclusions | Window | Status |
|---|---|---|---|---|---|---|
| `tenant.learners` | Learners in scope | Memberships with status `active` holding the Learner role, in scope | — | Invited/deactivated memberships excluded | Snapshot now; "previous" at period start | Proposed |
| `tenant.published_courses` | Published courses | Courses of the tenant whose current version is `published` | — | Archived courses excluded; organisation-wide even for branch scope (courses are not branch-owned) | Snapshot; "previous" at period start | Proposed |
| `tenant.completion_rate` | Completion rate (D-065) | `completed` enrollments in scope | Non-`cancelled` enrollments in scope | Enrollments created in the period | Selected period | **Confirmed** (D-065) |
| `tenant.overdue_enrollments` | Overdue enrollments (D-054) | Enrollments in scope with `dueAt` before now (tenant zone), status not `completed`/`cancelled` | — | — | Now | Proposed (D-054) |
| `tenant.learning_progress` | Enrollments and completions per bucket | As `platform.enrollment_trend`, in scope | — | Cancelled excluded | Weekly / monthly buckets | Proposed |
| `tenant.upcoming_deadlines` | Next due dates | Per course + due date: learners in scope with that due date who have not completed | — | Due in the next 30 days, not yet overdue; soonest first; top 5 | Next 30 days | Proposed |

Compliance metrics (compliance rate, due soon, overdue requirements) are defined in Phase 5 with D-018.

## Learner metrics (own records only — `enrollment.read` scope O)

| Key | Definition | Value | Filters and exclusions | Window | Status |
|---|---|---|---|---|---|
| `learner.progress_percent` | Progress through one enrollment | Required lessons completed ÷ required lessons in the **enrolled version**, as an integer percent (rounded down; shared `courseProgress`, used by the dashboard and the player) | Optional lessons do not count (D-016) | Now | Proposed (D-016) |
| `learner.resume_lesson` | Where "Continue" lands | First opened-but-unfinished lesson in course order, else first not completed, else first lesson (`resumeLesson`) | Shown on the dashboard as "Next: <lesson>" and used by the player | Now | Proposed (D-070) |
| `learner.attempt_score` | Score of one graded assessment attempt | Points of questions answered exactly right (multiple select all-or-nothing, unanswered 0) ÷ points possible × 100, rounded half-up to one decimal, as integer tenths; passed when ≥ pass mark (`scoreAttempt`) | Learner sees score + outcome only (D-023) | Per attempt | Proposed (D-042 rounding); D-072, D-023 Confirmed |
| `learner.display_status` | Status shown for an enrollment | Stored lifecycle, except **overdue** when not completed/cancelled and the due date is before today in the tenant zone; the due date itself is not overdue (`enrollmentDisplayStatus`) | — | Now | Proposed (D-054) |
| `learner.summary` | Own enrollments by display status | Counts of not started / in progress / overdue / completed | Cancelled excluded | Now | Proposed |
| `learner.deadlines` | Upcoming and missed due dates | Not completed, due within 30 days or overdue; soonest first; top 5 | Cancelled excluded | Next 30 days + overdue | Proposed |

Refresh: computed on request (no cache) until volume requires a materialised view (Phase 6.4 decides). Computed in:
`apps/api` reporting module, `GET /api/v1/platform/dashboard` (Phase 2.2 counts; 6.4 trends and rates).
