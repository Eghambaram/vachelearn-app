# Implementation Plan

## Phase 0 — Discovery and definition
**Deliverables:** workspace audit, product requirements, UI inventory, architecture proposal, domain model, role matrix, decisions log, first vertical slice plan.
**Exit:** owner reviews plan and open decisions. No large code changes before the audit.

## Phase 1 — Design system and UI foundations
Build reusable tokens and components: navigation, page headers, tables, forms, cards, status badges, dialogs, filters, pagination, charts, empty/loading/error states.
Create responsive prototypes for:
- Platform Admin dashboard
- Tenant Admin dashboard
- Course management and builder
- Learner dashboard
- Course learning player
- Assessment
- Certificates
- Compliance/reporting
Keep demo data explicitly marked and separate from real backend state.
**Exit:** screen flows reviewed, no core action presented as a working backend feature unless it is implemented.

## Phase 2 — Platform foundation
Scaffold repo, configuration, database, migrations, health checks, authentication, tenant/branch, memberships, roles, audit events and CI.
**Exit:** automated two-tenant and branch-isolation tests pass.

## Phase 3 — People and course content
Invitations, groups, permissions, catalog, authoring, assets, course versions and publishing.
**Exit:** tenant admin can publish a versioned course; authorized learner can discover it.

## Phase 4 — Core learning lifecycle
Assignments, enrollments, player, progress, assessment attempts, completion policy and certificates.
**Exit:** complete end-to-end learner journey passes.

## Phase 5 — Training operations
Compliance rules, basic reports and CSV, surveys, classroom sessions, attendance, notifications.
**Exit:** online and instructor-led training evidence is reflected in scoped reports.

## Phase 6 — Commerce and analytics
Select payment provider; implement checkout, verified webhooks, refunds, metric dictionary, saved reports and governed custom report builder.
**Exit:** order/payment reconciliation and analytics scope tests pass.

## Phase 7 — Production readiness
Security review, accessibility, performance tests, backup/restore, deployment, migration rehearsal if applicable, runbook and release checklist.
**Exit:** go/no-go checklist signed.

## Work protocol
For each slice: state acceptance criteria → list files → implement → run lint/typecheck/tests/build → fix failures → update docs → report actual results and limitations.
