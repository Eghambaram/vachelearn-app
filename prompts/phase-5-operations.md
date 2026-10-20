# Phase 5 — Training operations (Release R3)

**Exit:** online and instructor-led training evidence is tracked against compliance requirements and appears correctly
in scoped reports and exports; surveys collect feedback under the chosen anonymity rules.

## Message to send

```text
Start Phase 5 from prompts/phase-5-operations.md. Confirm D-016 (attendance in completion), D-018, D-019, D-020 and
D-026 first. Write docs/METRICS.md entries for every number this phase displays before implementing it. Plan Slice 5.1.
```

## Read first

Spec §11, §12, §13, §18 · `docs/ACCEPTANCE_TESTS.md` "Compliance and reports", "Surveys and classroom" · UI refs 05,
07 · `docs/LEGACY_CAPABILITY_INVENTORY.md` §Compliance, §Classroom, §Notifications.

## Slices

### 5.1 Compliance requirements + status engine
TrainingRequirement (course/version policy, applicability by tenant/branch/group/department/role, due rule, validity/
renewal, effective dates, policy version), status computation (Compliant, Due Soon, Overdue, Not Started, Not
Applicable), ComplianceEvidence linking completions/certificates, renewal cycles.
**AC:** boundary-date tests (day before/of/after due, due-soon threshold, expiry) in two timezones; completing renews
without deleting earlier evidence.

### 5.2 Compliance dashboards + reports
Tenant and branch compliance views, expiring certificates, branch comparison; drill-down to records.
**AC:** numbers reconcile with filtered record lists; Compliance Viewer is read-only.

### 5.3 CSV exports (async)
Export jobs reusing the report query + authorization, formula-injection escaping, row limits, status + retry, download
via signed URL, audit event with requester, scope, filters.
**AC:** export equals on-screen filtered data; other branch never included; failed job visible and retryable.

### 5.4 Surveys
Builder, versions (freeze on first response), audience and window, attachment points, anonymity mode, multiple-response
policy, learner response flow, results with response rate vs eligible audience, free-text visibility rules.
**AC:** outside audience/window → rejected; anonymous responses contain no user ID and cannot be joined back via
timestamps or IDs in the same table; duplicate submission prevented unless allowed.

### 5.5 Classroom sessions
Venues, ClassSession (course/version, times + tz, venue/link, capacity, instructors, registration window,
cancellation), registration/cancellation, waitlist only if D-019, instructor calendar + roster, attendance with audit,
completion via policy.
**AC:** end > start; capacity enforced under concurrent registrations; only assigned instructors/admins mark
attendance; cancelled session cannot complete without reopen; times correct across timezones.

### 5.6 Notifications
Notification events (invitation, assignment, due-soon, overdue, enrollment confirmation, session change, certificate
issued/expiring, survey request), templates per tenant (minimal), delivery state, retries without duplicates,
in-app notification list. Scheduled reminders via the job runner.
**AC:** email outage does not roll back learning transactions; retry does not double-send.

### 5.7 Bulk user import (only if D-044 schedules it here)
CSV upload through `StorageService`, whole-file validation, preview of valid / invalid / duplicate rows, downloadable
error report (formula-injection safe), idempotent commit as a job (creates memberships + invitations), audit.
**AC:** spec §5 import AC — preview counts are correct; committing twice creates no duplicate memberships; a branch
admin cannot import into another branch; invalid rows never partially commit.

## Exit gate

MASTER_PROMPT §10 steps 10–11 pass · isolation suite covers all R3 resources and exports · METRICS.md covers every
displayed number · reviews by subagents · owner demo.

## Change log

- v2.0 — from MASTER_PROMPT v1 Phase 5 / spec sprint 4.
- Phase 0 (2026-10-20) — added slice 5.7 for bulk import (spec §5 AC 7), pending D-044.
