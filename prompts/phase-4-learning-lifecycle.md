# Phase 4 — Core learning lifecycle (Release R2 — the MVP)

**Exit:** the core journey passes end-to-end: assign → learn → resume → assess (fail, retake, pass) → complete →
certificate issued once → verified publicly → visible in basic reports, with isolation intact.

## Message to send

```text
Start Phase 4 from prompts/phase-4-learning-lifecycle.md. Confirm D-004, D-011, D-016, D-017, D-023 and D-032 —
ask me about any that are still "Needs decision" before building the slice that depends on it. Plan Slice 4.1.
```

## Read first

Spec §7, §8, §9, §10, §11 (basic reports part) · `docs/ACCEPTANCE_TESTS.md` "Assignments and progress",
"Assessments and certificates" · UI refs 03, 13, 05 · `.claude/rules/testing.md` (idempotency + boundary tests).

## Slices

### 4.1 Assignments + enrollment fan-out
Assignment (targets: users, groups, branch cohorts within scope; due date; priority; mandatory/optional), idempotent
fan-out via job with business key, enrollment sources, group-change behaviour per D-004, due-date-in-past rule
(D-032), cancellation preserving history, "why does this enrollment exist" view.
**AC:** retry (and concurrent double-submit) creates no duplicate active enrollment; targets outside scope → rejected;
removed group member keeps completed history.

### 4.2 Learner dashboard + My Learning (real data)
Replace demo fixtures: Assigned / In progress / Completed / Overdue / Upcoming / Available, due indicators, continue
cards, deadlines. Overdue is computed from server time + tenant timezone.
**AC:** learner sees only own enrollments; filters correct at due-date boundaries (tests in two timezones).

### 4.3 Player + progress
Lesson navigation, server-side progress events (started, position, completed) with throttling and idempotency,
resume across devices, completion rules per lesson type, recoverable media errors.
**AC:** progress survives refresh, logout/login and a second browser context (Playwright); opening a lesson does not
complete it unless configured; optional lessons do not change completion %.

### 4.4 Assessments
Question bank, assessment builder (single, multiple, true/false; points, pass mark, attempts, time limit), version
freeze on first attempt, attempt start/submit, server scoring with documented rounding, attempt history, staff
review with answer-key visibility per D-023.
**AC:** cannot submit for a version not entitled; attempt and time limits enforced across two concurrent tabs;
client-sent score ignored; retake creates a new attempt.

### 4.5 Completion policy + course completion
Per-course policy (required lessons, passing assessment, attendance placeholder for Phase 5) evaluated server-side on
relevant events; completion recorded once; events in `LearningEvent`.
**AC:** duplicate completion events produce one completion; unmet conditions → no completion (unit + API tests).

### 4.6 Certificates
Template (tenant-branded, versioned, placeholders), award job on completion (idempotent per enrollment + cycle),
PDF render from snapshot + hash, learner download, staff search, revoke/supersede with reason, public verification
page/endpoint with minimal data (D-017) and rate limit.
**AC:** one award per cycle even with duplicate events; PDF has correct learner/course/version/dates/ID; revoked shows
as revoked; template change does not alter issued PDFs.

### 4.7 Basic reports
Learner progress, course completion, overdue assignments — scoped, filtered, with scope/filters/generated-at/timezone
banner; totals reconcile with source records (test).
**AC:** branch admin sees only their branches; report totals equal direct counts in an integration test.

## Exit gate

Full Playwright journey (MASTER_PROMPT §10 steps 1–9) green · isolation suite extended to all R2 resources ·
`security-reviewer` + `tenant-isolation-auditor` + `qa-verifier` passes · docs updated · owner demo.

## Change log

- v2.0 — from MASTER_PROMPT v1 Phase 4 / spec sprint 3; basic reports pulled into MVP per spec §1.3.
