> **Superseded.** This prompt has been merged into `MASTER_PROMPT.md` v2.0 (2026-10-20). It assumed an existing
> repository; VacheLearn is greenfield. Keep for background only — do not follow its phase numbering
> (its Phase 1–6 = Phase 2–7 in MASTER_PROMPT v2.0).

# VacheLearn — Complete Master Build Prompt
Version: 1.0
Purpose: Use this prompt with a coding agent (Claude Code, Codex, Cursor, or equivalent) to plan, implement, test, and document the VacheLearn industrial LMS MVP in the existing repository.

---

## 1. Role and operating standard

Act as the principal product architect, enterprise SaaS engineer, security architect, UX lead, QA lead, and DevOps engineer for **VacheLearn**, an **Industrial & Technology Workforce Readiness Platform**.

Build a production-minded, multi-tenant SaaS application with an enterprise-grade user experience. Use disciplined, incremental engineering. Do not generate a throwaway demo or a collection of disconnected screens. The result must be a coherent, testable application with real persistence, authorization, workflows, error handling, and documentation.

Product experience principle: **Learn → Practice → Prove → Certify → Improve**.

The application should feel clear and premium—combining the polish and simplicity of modern SaaS products such as Linear, Stripe, and Apple with the information density required by industrial operations. Do not copy any brand’s interface verbatim. Prefer a graphite/neutral foundation, restrained warm amber and/or teal/green accents, excellent typography, clear hierarchy, accessible contrast, useful tables, and responsive layouts. Use the supplied brand assets and UI references if attached.

## 2. First action: inspect before changing anything

Before coding:
1. Inspect the repository structure, package manager, existing source files, Git status, current implementation, deployment configuration, database schema/migrations, environment examples, and tests.
2. Read every project instruction file present, especially `CLAUDE.md`, `PROMPT.md`, `PHASE.md`, `README.md`, `AGENTS.md`, and package-level instructions.
3. Inspect all attached legacy admin screenshots, learner screenshots, ERD, existing VacheLearn diagrams, product UI references, and implementation specification.
4. Identify what already works and preserve it. Do not replace a working implementation merely because you prefer another pattern.
5. Produce `docs/IMPLEMENTATION_AUDIT.md` containing: current architecture, implemented capabilities, gaps, risky areas, decisions needed, and a phased execution plan.
6. Produce or update `docs/DECISIONS.md` for decisions and assumptions. Label each item as **Confirmed**, **Proposed**, or **Needs product-owner decision**.
7. If files or business rules are missing, record the gap and continue only where safe. Never invent legacy behavior or silently discard existing data.

Do not start with a full rewrite. Do not make broad changes before the audit and plan are documented.

## 3. Product scope

Implement the following capability areas using one coherent domain model. Deliver in phases, with a working and tested application at each phase.

### A. Multi-tenant and branch management
- Platform Super Admin can create, configure, activate, suspend, and archive tenants.
- Tenant has a stable ID, unique slug, name, status, timezone, locale, and configurable settings.
- Tenant admins manage multiple branches/sites with branch code, name, address/location, timezone, and status.
- Support tenant branding and optional tenant domains/subdomains where infrastructure permits.
- Tenant suspension blocks user access and new enrollment/purchase operations while retaining historical records.
- Branch deactivation blocks new branch operations but preserves history.

### B. Users, groups, invitations, and roles
- Global user identity with separate tenant memberships and branch memberships.
- Invite, accept, expire, revoke, activate, deactivate, and reactivate flows.
- Invitations must be single-use, expiring, email/tenant scoped, and store only a token hash.
- Manage groups and group membership for targeting assignments and reports.
- Explicit permission model with role assignments scoped to platform, tenant, branch, or permitted resource.
- Starter roles: Platform Super Admin, Tenant Admin, Branch Admin, Learning Manager, Instructor/Trainer, Learner, Compliance Viewer/Auditor.
- Enforce least privilege; deny by default.
- Bulk import may be added after the basic lifecycle is stable; validate and preview before committing.

### C. Course catalog and content authoring
- Tenant-owned course catalog with search, filters, categories, tags, language, duration, delivery mode, visibility, eligibility, prerequisites, and optional price.
- Course states: Draft, Published, Archived.
- Course builder supports ordered modules and lessons.
- MVP content types: text/HTML, video, PDF/document, external link, and assessment/quiz.
- Use a `StorageService` abstraction for files. Development can use MinIO; production storage must be configurable for S3-compatible storage.
- Use a `VideoProvider` abstraction. Prefer Cloudflare Stream for initial video hosting, with PostgreSQL storing metadata and learning progress; do not store large video binaries in PostgreSQL.
- Published course versions are immutable. Editing published content creates a new draft/version.
- Existing enrollments stay tied to their enrolled course version unless an explicit migration action is approved.

### D. Assignments and enrollments
- Assign learning to users, groups, and authorized branch cohorts.
- Record assigner, assigned date, due date, priority, requirement type, source, and status.
- Enrollment sources include assignment, self-enrollment, paid enrollment, and classroom/session.
- Assignment fan-out must be idempotent and safe to retry.
- Define and test behavior for group members added after assignment and users removed from groups.
- Preserve historical learning evidence when assignments or users are deactivated.

### E. Learner dashboard and learning player
- Responsive learner dashboard with Assigned, In Progress, Completed, Overdue, Upcoming/Classroom, and Available sections as applicable.
- Course detail shows learning outcomes, duration, delivery mode, prerequisites, certificate availability, eligibility, and price if relevant.
- Player supports lesson navigation, resume progress, completion states, accessible media controls, and next/previous navigation.
- Progress is stored server-side and resumes across refreshes and devices.
- Opening a lesson must not automatically complete it unless its explicit completion policy allows it.
- Clearly distinguish course completion, assessment pass, attendance completion, and certificate issuance.

### F. Assessments and progress
- Question bank and assessment authoring.
- Minimum question types: single-choice, multiple-select, true/false. Additional types only after core behavior is reliable.
- Configurable pass mark, points, attempts, time limit, and required/optional status.
- Assessment versions freeze once attempts exist; edits create a new version.
- Server calculates scores and pass/fail; never trust client-calculated scores.
- Store attempts and answers as historical evidence.
- Course completion policy can require lessons, passing assessment, attendance, or a defined combination.
- Duplicate events must not double-count progress or issue duplicate certificates.

### G. Completion certificates
- Manage tenant-branded templates with supported placeholders such as learner name, course title/version, completion/issue dates, certificate ID, issuer, and optional expiry.
- Issue only when the configured completion policy is satisfied.
- Preserve immutable award evidence and issued artifact/version.
- Learner can view/download PDF certificates.
- Support revocation, supersession, expiry and renewal where configured; never silently delete issued evidence.
- Public verification uses an opaque identifier and exposes only minimal verification data.

### H. Basic compliance and progress reports
- Training requirements can apply to a tenant, branch, group, department or role/job cohort as supported by the implemented model.
- Define compliance statuses: Compliant, Due Soon, Overdue, Not Started, Not Applicable.
- Support learner progress, course completion, overdue assignments, compliance status, expiring certificates, and branch comparison.
- Filters must include applicable date range, branch, group/department, course, learner, and status.
- CSV export must enforce the same filters and permissions as the on-screen report.
- Show report scope, filters, generated timestamp and timezone.
- Protect CSV exports against spreadsheet formula injection.

### I. Surveys and feedback
- Survey builder with title, description, audience, open/close dates, required fields, and response visibility/anonymity mode.
- MVP question types: single choice, multiple choice, rating scale, and free text.
- Surveys can be attached to courses, course completion, classroom sessions, or targeted audiences.
- Freeze survey versions after responses begin.
- Enforce audience and time window server-side.
- Anonymous surveys must not directly store the respondent identity in the response payload; clearly document operational metadata limits.

### J. Classroom and instructor-led sessions
- Create sessions linked to a course with start/end, timezone, venue or meeting link, capacity, instructor(s), registration window, and cancellation policy.
- Learner registration/cancellation; waitlist only if explicitly implemented and tested.
- Instructor roster and attendance states: Present, Absent, Late, Excused.
- Audit attendance edits and session changes.
- Attendance only completes a course when the course completion policy says so.
- Handle capacity, cancellation, timezone display, and notification failures gracefully.

### K. Commerce and paid enrollment
- Tenant-configurable offers/prices and supported currency.
- Server creates order and order lines; server calculates price/currency.
- Use a payment-provider adapter; select the provider through a documented decision before production.
- Separate order, payment attempt, refund, and learning entitlement states.
- Grant enrollment only after verified provider confirmation; browser redirect alone is never proof of payment.
- Verify webhook signatures, deduplicate provider event IDs, and make webhook processing idempotent.
- Do not store raw card numbers or CVV.
- Preserve learning evidence after refund; access after refund follows an explicit policy.
- Record provider transaction ID, amount, currency, timestamps and reconciliation state.

### L. Advanced analytics and custom reporting
- Define a metric dictionary before dashboard implementation.
- Standard metrics: active learners, enrollments, starts, completion rate, assessment pass rate, overdue compliance, certificate expiry, classroom attendance, branch comparison, and paid enrollment/revenue where commerce is enabled.
- Each metric must define numerator, denominator, time window, timezone, status exclusions, and refresh expectation.
- MVP custom report builder uses approved dimensions, metrics, filters, grouping and date ranges; do not allow arbitrary SQL.
- Users can save, rename, duplicate, rerun and export reports within their authorization scope.
- Heavy exports run asynchronously with limits, retries and visible status.
- Dashboard values must reconcile with the equivalent filtered report within the documented refresh window.

## 4. Required technical direction

Preferred stack:
- Frontend: Next.js + TypeScript.
- Backend API: NestJS + TypeScript.
- Database: PostgreSQL.
- ORM: use the repository's established ORM if healthy; otherwise select Prisma or Drizzle and use it consistently.
- Deployment: Docker-compatible and CI/CD-friendly.
- File storage: `StorageService` abstraction, MinIO for local development, S3-compatible production storage.
- Video: `VideoProvider` abstraction, Cloudflare Stream as initial provider unless repository or product-owner decisions supersede it.
- Background jobs: start with the simplest reliable queue/outbox already supported by the repository; add Redis/BullMQ when required for notifications, imports, exports, certificates, or webhook processing.
- Monitoring: structured logs, request/correlation IDs, error tracking, health/readiness checks, backups, and tested restore procedure.
- Email and payment integrations must be behind provider adapters. Keep credentials server-side.

Use a **modular monolith first**, not microservices, unless the existing system has a justified alternative. Keep domain modules separated, with clear service boundaries and no circular dependency sprawl.

## 5. Suggested application modules

Adapt names to the existing repository rather than duplicating modules:
1. Auth & Sessions
2. Tenants & Branches
3. People & Memberships
4. Roles & Permissions
5. Groups
6. Courses & Course Versions
7. Assets & Video
8. Catalog & Discovery
9. Assignments & Enrollments
10. Learning Progress
11. Assessments
12. Certificates
13. Compliance
14. Surveys
15. Classroom/Sessions
16. Commerce/Orders/Payments
17. Reporting & Analytics
18. Notifications
19. Audit
20. Platform Administration

## 6. Data integrity and tenant security rules

These are release-blocking:
- Derive tenant context from authenticated membership, never trust an arbitrary client `tenant_id`.
- Scope every tenant-owned read and write in service logic.
- Branch-scoped users cannot cross branch boundaries by changing IDs, filters, URLs, pagination cursors, export IDs or request payloads.
- Add foreign keys, unique constraints, check constraints and indexes for important relationships and query patterns.
- Prevent cross-tenant references at both service and database layers where practical.
- PostgreSQL RLS may be used as defense in depth; if used, set tenant context transaction-locally and prevent pooled-connection context leakage.
- Published course and assessment versions are immutable.
- Store timestamps in UTC; render in configured tenant/user timezone.
- Use append-only audit events for security-sensitive actions.
- Never log passwords, session tokens, payment secrets, signed media URLs, or sensitive assessment answers.
- Use secure, non-guessable file object keys; validate uploads and limit file types/size.
- Validate and deduplicate all payment webhooks.
- Use transactions for state changes that must be atomic.
- Make background jobs idempotent and retry-safe.

## 7. UX requirements

Create a consistent design system and real responsive screens, not static mockups only.

Required portals and views:
- Platform Admin: platform overview, tenant list/detail, tenant lifecycle, platform settings, usage overview, audit.
- Tenant Admin: dashboard, branches, users, groups, courses, assignments, assessments, certificates, compliance, surveys, sessions, commerce where enabled, reports, branding/settings.
- Branch Admin: scoped users, groups, courses/assignments, attendance and reports.
- Learning Manager: assignments, team/branch progress, compliance and reports.
- Instructor: assigned courses/sessions, roster, attendance, assessments and learner progress.
- Learner: dashboard, assigned/available learning, course player, assessments, certificates, classroom sessions, surveys, profile and progress.
- Public/tenant catalog: tenant-branded course discovery, course detail and paid checkout only where enabled.

UX rules:
- Consistent navigation, breadcrumbs, filters, table pagination, status labels and empty/loading/error states.
- Confirmation for destructive actions.
- Field-level validation and clear recovery messages.
- Accessible keyboard operation, visible focus, labels, text alternatives and non-color status indicators.
- Target WCAG 2.2 AA for primary workflows.
- Mobile-friendly learner experience.
- Use supplied screenshots as workflow references, not as permission to reproduce legacy visual design.

## 8. API and code quality standards

- Use `/api/v1` or follow the existing API versioning convention.
- Consistent request validation and error envelopes.
- Use 401 for unauthenticated, 403 for unauthorized, 404 where revealing existence would leak information, 409 for state conflicts, and 422 for invalid input where appropriate.
- Server-side authorization on every protected endpoint.
- Allowlisted sort fields and bounded pagination.
- Use idempotency keys for orders, webhooks, assignment fan-out and certificate award jobs.
- Use optimistic concurrency/version checks where concurrent editing could overwrite changes.
- Keep controllers thin; domain rules belong in services/domain logic.
- Avoid `any` unless justified; prefer typed DTOs and explicit API contracts.
- Add unit, integration, API and end-to-end tests.
- Do not leave placeholder buttons, fake data, unimplemented actions, or TODO-only core workflows in a claimed completed phase.
- Do not add dependencies without a clear need; inspect current versions and compatibility first.
- Keep environment variables documented in `.env.example`; never commit real secrets.

## 9. Minimum end-to-end acceptance journey

The following must eventually pass in a test environment:
1. Platform admin creates Tenant A and Tenant B.
2. Tenant A creates two branches and invites a branch-scoped learner and instructor.
3. The learner accepts the invitation; replaying the invite fails.
4. Tenant admin creates a course, adds lessons and an assessment, and publishes version 1.
5. Admin assigns the course to a group with a due date; retrying assignment creation creates no duplicates.
6. Learner opens the dashboard, starts learning, resumes later, completes required lessons and submits the assessment.
7. Failed attempts remain in history; a passing attempt satisfies the configured policy.
8. Certificate is issued once, can be downloaded and verified, and its evidence points to the correct learner/course version.
9. Compliance and progress reports reflect the same enrollment and completion records.
10. Branch admin cannot see Tenant B or another branch's restricted records.
11. Instructor creates a classroom session, records attendance and the configured completion rule is applied.
12. Learner submits an eligible survey and results follow the configured visibility/anonymity rules.
13. Paid course checkout grants enrollment only after a verified, deduplicated provider event; a fake redirect cannot grant access.
14. Refund follows the explicit access policy and preserves historical learning evidence.
15. A saved custom report and its export enforce identical scope and filters.

## 10. Required documentation and deliverables

Maintain these in the repository:
- `docs/IMPLEMENTATION_AUDIT.md` — initial repo audit and gaps.
- `docs/DECISIONS.md` — confirmed/proposed/open decisions.
- `docs/ARCHITECTURE.md` — context, modules, trust boundaries and deployment.
- `docs/DOMAIN_MODEL.md` — entities, relationships, ownership, status transitions and tenant boundaries.
- `docs/ROLE_PERMISSION_MATRIX.md` — permissions by role and scope.
- `docs/API_SPECIFICATION.md` or generated OpenAPI/Swagger docs.
- `docs/ACCEPTANCE_TESTS.md` — scenarios and expected results.
- `docs/MIGRATION_MAPPING.md` — legacy source-to-target mapping and unresolved fields.
- `docs/RUNBOOK.md` — setup, deploy, backup, restore, troubleshooting and operational checks.
- `.env.example` — documented variables with no secrets.
- Seed/demo data for at least two tenants and multiple branches, clearly marked as non-production.
- Database migrations and automated tests.
- Updated `README.md` with exact local setup and test commands.

## 11. Phased execution protocol

Do not attempt to implement every module in one giant, unreviewed change. Work in small vertical slices.

### Phase 0 — Audit and plan
- Inspect the repository and attachments.
- Create the audit, decisions log, architecture outline, dependency map and phase plan.
- Report the current working state and any blocking decisions.
- Do not rewrite code in this phase except for safe documentation changes.

### Phase 1 — Platform foundation
- Auth/session integration, tenant/branch model, memberships, roles/permissions, audit, database migration baseline, error handling, test setup and CI checks.
- Add automated cross-tenant and cross-branch tests.
- Demonstrate two-tenant isolation.

### Phase 2 — Content and identity workflows
- Invitations, groups, course authoring, versioning, storage/video adapters and catalog.
- Deliver working admin screens and APIs, not mockups.

### Phase 3 — Learning lifecycle
- Assignments, enrollments, learner dashboard/player, progress, assessments, completion policy and certificates.
- Complete the end-to-end acceptance journey.

### Phase 4 — Training operations
- Compliance rules, basic reports, surveys, classroom sessions, attendance, notifications and CSV export.

### Phase 5 — Commerce and analytics
- Select/implement payment provider, paid enrollment, webhook reconciliation, refunds, metric dictionary, saved reports and advanced analytics.

### Phase 6 — Production readiness
- Security review, accessibility, load/performance tests, backup restore, migration rehearsal, operational docs and release checklist.

For each phase:
1. State the goal and files/modules to change.
2. Implement the smallest complete vertical slice.
3. Run formatting, lint, type-check, unit/integration tests and build.
4. Fix failures before proceeding.
5. Update docs and `.env.example`.
6. Summarize files changed, behavior delivered, tests run/results, known limitations and next phase.
7. Do not claim tests passed unless you actually ran them.
8. Do not mark a feature complete if its main actions are mocked or its data is not persisted.

## 12. Definition of Done

A phase is complete only when:
- Acceptance criteria for that phase are implemented and testable.
- Authorization is enforced on the API, not just in the UI.
- Tenant/branch negative tests pass.
- Migrations work from a clean database and are safe for the intended deployment process.
- Core errors, loading states, empty states and validation are handled.
- No core action is a dead button or fake success.
- Logs and audit events cover sensitive state changes.
- Documentation and environment examples are updated.
- Lint, type-check, tests and production build pass, or failures are explicitly reported with a reason.
- Known gaps and product decisions are documented.

## 13. Product decisions that must not be silently invented

If not confirmed in attached documentation or the existing code, record these in `docs/DECISIONS.md`:
- Payment provider, supported countries/currencies, tax/invoice rules and refund policy.
- Exact compliance due-soon thresholds and renewal rules.
- Group assignment behavior for members added/removed after assignment.
- Course-version migration policy for existing enrollments.
- Course completion policy and whether attendance is mandatory.
- Survey anonymity and response visibility.
- Public catalog visibility and custom domain/subdomain setup.
- Supported content standards such as SCORM/xAPI; do not claim support unless implemented and tested.
- Data retention/deletion rules and certificate revocation/expiry behavior.
- Expected user volume, concurrent users, performance targets and backup retention.

## 14. Final instruction

Start with **Phase 0 — Audit and plan**. Read the attached VacheLearn implementation specification and legacy materials before coding. Inspect the actual repository and preserve working code. Create the audit and decision log, then propose the first vertical slice. Do not implement the entire scope in one pass. Prioritize security, tenant isolation, correct learning evidence, maintainability, and a low fixed-cost architecture suitable for a POC/MVP that can scale with usage.

At the end of your first response, provide:
1. A concise repository assessment.
2. The proposed phase plan.
3. A list of confirmed versus unresolved decisions.
4. The first vertical slice to implement.
5. Any missing files or credentials required—never ask for production secrets in chat.
