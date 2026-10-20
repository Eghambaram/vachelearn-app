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

Refresh: computed on request (no cache) until volume requires a materialised view (Phase 6.4 decides). Computed in:
`apps/api` reporting module, `GET /api/v1/platform/dashboard` (Phase 2.2 counts; 6.4 trends and rates).
