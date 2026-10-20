# VacheLearn — Master Build Prompt

**Version 2.0 (consolidated)** · supersedes `MASTER_PROMPT.md` v1.0 and `docs/Supplementary_Master_Prompt.md` v1.0 ·
companion to `docs/VacheLearn_MVP_Implementation_Specification.docx` (Markdown copy: `docs/MVP_SPEC.md`).

This file is the product brief and build constitution. `CLAUDE.md` is the always-loaded operating manual; the
`prompts/` folder holds the step-by-step instructions for each phase. When they disagree, precedence is:
**product-owner decisions in `docs/DECISIONS.md` (Confirmed) → this file → `docs/MVP_SPEC.md` → other docs →
reference images and legacy material.** Report any disagreement you find instead of silently picking one.

---

## 1. Mission and stance

Build **VacheLearn**, a multi-tenant **Industrial & Technology Workforce Readiness Platform**, from a clean start.
No application, repository, database, cloud account, or working feature exists yet. Do not assume otherwise; if you
find code, inspect and preserve what works before changing it.

Act as principal product architect, senior full-stack engineer, UX designer, security engineer, QA lead and DevOps
engineer. Work in small, verifiable vertical slices with the product owner. Optimise for: tenant isolation, correct
learning evidence, maintainability, accessibility, and **low fixed cost** during POC/MVP with a path to scale.

Product journey: **Learn → Practice → Prove → Certify → Improve.**

Experience bar: clear and premium like modern SaaS (think the restraint of Linear/Stripe), dense enough for
industrial operations. Do not copy any other product's interface.

## 2. Users and roles

| Role | Default scope | Core capabilities |
|---|---|---|
| Platform Super Admin | Platform | Tenant lifecycle, platform settings, platform users, usage, platform audit |
| Tenant Admin | One tenant | Settings/branding, branches, people, groups, roles, courses, assignments, reports, commerce config |
| Branch Admin | Assigned branches | Branch people/groups, branch learning operations, branch reports |
| Learning Manager | Tenant or assigned branches | Assignments, progress monitoring, programmes, compliance reports |
| Instructor/Trainer | Assigned courses/sessions | Sessions, rosters, attendance, permitted content, assessment review |
| Learner | Own records | Discover, learn, attend, assess, survey, download own certificates |
| Compliance Viewer/Auditor | Read-only, scoped | Requirements, evidence, overdue items, completion records, audit exports |

A global **User** identity can hold **Memberships** in several tenants with different roles in each. Roles are
assigned at a scope (platform / tenant / branch / resource). Deny by default. The detailed matrix is
`docs/ROLE_PERMISSION_MATRIX.md`; permissions are explicit keys such as `course.publish`, `enrollment.assign`,
`report.export`.

## 3. Capability scope and release mapping

Twelve capability areas, delivered across four releases. Acceptance criteria for each area are in
`docs/MVP_SPEC.md` (section numbers in brackets) and `docs/ACCEPTANCE_TESTS.md`; treat each AC as a test.

| # | Capability | Release | Spec § |
|---|---|---|---|
| A | Multi-tenant & branch management | R1 Foundation | 4 |
| B | Users, groups, invitations, roles | R1 (roles, memberships) / R2 (invitations, groups) | 5 |
| C | Course catalog & authoring, versioning | R2 Core Learning MVP | 6 |
| D | Assignments & enrollments | R2 | 7 |
| E | Learner dashboard & player | R2 | 8 |
| F | Assessments & progress | R2 | 9 |
| G | Completion certificates | R2 | 10 |
| H | Basic compliance & progress reports | R2 (basic reports) / R3 (compliance rules) | 11 |
| I | Surveys & feedback | R3 Operational | 12 |
| J | Classroom / instructor-led sessions | R3 | 13 |
| K | Commerce & paid enrollment | R4 Commercial & Analytics | 14 |
| L | Advanced analytics & custom reports | R4 | 15 |

Cross-cutting: notifications, audit, background jobs (spec §18); security & NFRs (§19); UX & accessibility (§16).

### 3.1 Key requirements per area (summary — the spec is authoritative for detail)

**A. Tenancy.** Tenant: stable ID, unique slug, name, status (`active | suspended | archived`, plus `trial` if
subscriptions are introduced), timezone, locale, settings, branding. Branch: code unique **within** tenant, name,
address, timezone, status. Suspension blocks tenant users and new enrollments/purchases on the next request and is
audited with actor + reason; history is retained. Branch deactivation blocks new branch operations, keeps history.
Renaming a tenant never alters IDs or issued certificate evidence.

**B. Identity & access.** Lifecycle: invite → accept → active → deactivated → reactivated; users with learning history
are never deleted. Invitations: tenant, optional branch/group, intended role, expiry, inviter, **single-use token
stored as a hash**, bound to email + tenant; replay/expiry/mismatch fail. Accepting adds only the invited membership;
existing memberships are untouched. Deactivation blocks new sessions and revokes active ones within a documented window.
Groups: name, description, optional branch/department scope, status; manual membership for MVP. Bulk import (later):
validate whole file, preview valid/invalid/duplicate rows, idempotent commit.

**C. Courses.** Metadata: title, summary, description, thumbnail, owner, category, tags, level, language, estimated
duration, delivery mode (online / classroom / blended), visibility (private / tenant / public catalog), eligibility,
prerequisites, learning objectives, target audience, optional price, completion policy. Structure: ordered modules →
ordered lessons. MVP lesson types: rich text, video, PDF/document, external link, quiz/assessment. States: Draft →
(Under Review, if enabled — D-022) → Published → Archived. Publishing validates metadata, ≥1 valid learning item,
visibility and completion policy, then freezes an immutable **CourseVersion** with number, publisher and time.
Editing a published course creates a new draft version. Existing enrollments stay on their version unless an admin
explicitly migrates them. Archived courses accept no new enrollments; history remains.

**D. Assignments & enrollments.** Targets: users, groups, permitted branch cohorts. Store assigner, assigned date, due
date, priority, requirement type (mandatory/optional), reminder policy, source and status. Enrollment: learner, course
version, source (`assignment | self | purchase | session`), status (`not_started | in_progress | completed | overdue |
cancelled`, plus `failed`/`expired` only if a rule needs them), dates. Fan-out is idempotent; no duplicate active
enrollment. Group membership changes follow D-004. Past due dates: reject or require explicit confirmation (pick one,
test it). Admin can see why any enrollment exists.

**E. Learner dashboard & player.** Sections: Assigned, In Progress, Completed, Overdue, Upcoming sessions, Available.
Course detail shows outcomes, duration, delivery, prerequisites, eligibility, certificate availability, price.
Player: module/lesson navigation with completion indicators, resume position, previous/next, accessible media,
recoverable errors for broken assets. Progress is saved server-side at meaningful checkpoints (video: throttled
position updates) and resumes across devices. Opening a lesson does not complete it unless that lesson's policy
says so. UI distinguishes course completion, assessment pass, attendance and certificate issuance.

**F. Assessments.** Question bank; types single choice, multiple select, true/false (more only after these are solid).
Points, pass mark, attempt limit, optional time limit, required/optional. Versions freeze once an attempt exists.
Attempts store learner, assessment version, start/submit time, answers, score, pass/fail, attempt number, grading
status. Server validates question/option IDs and computes scores with a documented rounding rule. Limits enforced
server-side including concurrent tabs. Retakes never overwrite prior attempts. Answer-key visibility to learners and
staff follows policy (D-023).

**G. Certificates.** Tenant-branded templates with placeholders (learner name, course title + version, completion date,
issue date, certificate ID, issuer, optional expiry). Award only when the completion policy is satisfied; one award per
course/version/renewal cycle. Award stores immutable evidence: learner, course version, completion record, issue time,
template version, artifact hash, opaque public verification ID. Learner views/downloads PDF; staff search issued
certificates; revoke/supersede with reason + actor; expiry and renewal where configured. Public verification shows only
validity status, course title, issue/expiry date, issuer and learner display name if D-017 permits.

**H. Compliance & reports.** Requirement: course/version policy, applicability (tenant/branch/group/department/job
role), due rule, validity/renewal period, effective dates, policy version stored on evidence. Statuses: Compliant, Due
Soon, Overdue, Not Started, Not Applicable — with boundary-date tests. Reports: learner progress, course completion,
overdue assignments, compliance status, expiring certificates, branch comparison; filters date range, branch,
group/department, course, learner, status. Every report shows scope, filters, generated-at and timezone. CSV export uses
the same query + authorization as the screen, escapes formula-injection prefixes, runs async for large sets, is audited.

**I. Surveys.** Builder: title, description, questions (single, multiple, rating scale, free text), required flags,
open/close dates, audience, attachment point (course completion, session, audience), anonymity mode, response
visibility, multiple-response policy. Versions freeze after the first response. Server enforces audience, window,
required answers and duplicates. Anonymous mode stores no direct identifier in responses and does not leak identity
through metadata. Response rate is computed against the eligible audience.

**J. Classroom.** Session: course/version, start/end + timezone, branch/venue or meeting link, capacity, instructor(s),
registration window, cancellation policy. Register/cancel within policy; waitlist only if D-019 enables it. Attendance:
Present, Absent, Late, Excused, with actor + timestamp; edits audited. Attendance completes a course only per the
course's completion policy. Cancelled sessions cannot be marked completed without an explicit reopen flow.

**K. Commerce.** Offers/prices per tenant with currency and tax display rules. Server creates order + lines and
calculates amounts before redirecting to the provider's hosted checkout. Separate order, payment attempt, refund and
entitlement states. Entitlement only after a verified, deduplicated provider event. Webhooks: signature verification,
`(provider, eventId)` uniqueness, idempotent processing. Refund applies the explicit access policy (D-008); learning
evidence remains. Admin reconciliation by provider transaction ID, amount, currency, state. Never store PAN/CVV.

**L. Analytics.** Write `docs/METRICS.md` first. Standard metrics: active learners, enrollments, starts, completion
rate, pass rate, overdue compliance, certificate expiry, attendance, branch comparison, paid enrollments/revenue (if
commerce). Governed report builder: approved dimensions, metrics, filters, group-bys, bounded date ranges — **no
arbitrary SQL**. Saved reports: save, rename, duplicate, rerun, export within the owner's scope; sharing cannot exceed
the recipient's access. Dashboards reconcile with the equivalent filtered report within the documented refresh window.

### 3.2 Explicitly out of scope until separately approved

SCORM/xAPI/AICC/cmi5 claims without implementation + conformance tests (D-012) · arbitrary SQL reporting · storing
card data · microservices · reproducing every legacy table, module or screen · gamification/points/badges,
discussions/forums, notes, social profiles, wishlists/playlists, ratings/reviews, CEU credits, skills/proficiency
matrices, e-signatures, observation checklists, manager approval workflows, virtual-classroom (Zoom/Teams)
integrations, SSO (SAML/OIDC), native mobile apps — each is a candidate listed in `docs/LEGACY_CAPABILITY_INVENTORY.md`
and `docs/DECISIONS.md`, to be scheduled only by the product owner. Reference images that show such features (e.g.
Achievements, Notes, Discussion tabs) do not make them in scope; omit those UI regions rather than ship inert ones.

## 4. Architecture

| Layer | Default (Proposed until confirmed in Phase 0) | Notes |
|---|---|---|
| Repo | pnpm workspaces monorepo: `apps/web`, `apps/api`, `packages/*` only when justified, `infra/`, `docs/`, `prompts/` | Turborepo optional; add only if build orchestration needs it |
| Web | Next.js (App Router) + TypeScript, Tailwind CSS, shadcn/ui, React Hook Form + Zod | Responsive admin, learner, public catalog, tenant branding |
| API | NestJS + TypeScript, modular monolith, REST `/api/v1`, OpenAPI | Central authorization; thin controllers; domain services |
| DB | PostgreSQL + Prisma (one ORM) | Composite tenant FKs, CHECKs, partial unique indexes; RLS as optional defence in depth |
| Auth | API-owned: email + password (Argon2id), email verification, password reset, opaque server-side sessions in Postgres via httpOnly cookie, CSRF protection, rate limits; SSO adapter later | D-010 — alternatives (Auth.js, Clerk/Auth0, Keycloak) recorded with trade-offs |
| Files | `StorageService`: MinIO locally, S3-compatible in production (S3 or R2) | Signed short-lived URLs after authorization |
| Video | `VideoProvider`: `mock` locally; Cloudflare Stream candidate | D-006 — verify account + cost before adopting |
| Email | `EmailProvider`: console/Mailpit locally; provider chosen later | Delivery state stored; retries without duplicates |
| PDF | `PdfRenderer` for certificates (headless Chromium or a PDF library) | Snapshot + hash at award time |
| Jobs | Postgres job/outbox table first; BullMQ/Redis only when measured need | Idempotent, retry-safe, visible status |
| Payments | `PaymentProvider` adapter; provider per D-007 (India-first market implies evaluating Razorpay, Stripe, Cashfree) | Disabled until decision + policies are Confirmed |
| Ops | Docker images, CI (lint, typecheck, test, build, isolation, e2e smoke), staging + production with separate secrets, structured logs, request IDs, error tracking, health/readiness, backups with tested restore | Host choice is D-015 |

**Modules (bounded contexts):** Auth & Sessions · Tenants & Branches · People & Memberships · Roles & Permissions ·
Groups · Courses & Versions · Assets & Video · Catalog · Assignments & Enrollments · Learning Progress · Assessments ·
Certificates · Compliance · Surveys · Classroom · Commerce · Reporting & Analytics · Notifications · Audit · Platform
Administration. Modules communicate through exported services or domain events; no cross-module table access.

**Trust boundaries:** platform-wide access only with explicit platform permissions; tenant context from authenticated
membership; branch restrictions on reads, writes, exports and jobs; public catalog and certificate verification expose
minimal data; payment webhooks verified and deduplicated; platform support access to a tenant is explicit,
time-boxed and audited.

## 5. Security, integrity and privacy (release blockers)

- Scope every tenant-owned read/write by the resolved tenant; verify branch scope for branch-restricted actions.
- Negative tests for IDOR and privilege escalation by changing IDs, filters, cursors, export IDs and payloads.
- Database integrity: foreign keys (composite with `tenant_id` for tenant-owned relations), unique and CHECK
  constraints, transactions, indexes for main query patterns.
- If PostgreSQL RLS is used: `SET LOCAL` tenant context per transaction, non-owner app role, no pooled leakage;
  application authorization remains mandatory.
- UTC timestamps; display in tenant/user timezone. Money in minor units with currency.
- Append-only audit events for: tenant/branch lifecycle; invitations, memberships, role changes; course publish/archive;
  assignment changes; grading overrides; certificate issue/revoke/reissue; attendance edits; orders/refunds; report
  exports; platform support access; settings and branding changes.
- Never log secrets, tokens, invite links, signed media URLs, payment payloads or sensitive answers.
- Uploads: type/size validation by content, non-guessable keys, malware scanning where available.
- Secrets only in local env or a secret manager. `.env.example` lists names with placeholders.
- Privacy: minimise personal data; define retention/export/deletion (D-014) without erasing legally or operationally
  required evidence. India's DPDP Act 2023 and any target-market law must be reviewed by the owner's counsel —
  do not claim compliance with any law or standard without evidence.
- Performance baseline (Proposed, D-013): common list/detail p95 < 500 ms at agreed MVP load, excluding providers and
  heavy reports. Confirm against expected volume before load testing.

## 6. Domain model (initial inventory — refine before migrations)

Tenancy: Tenant, Branch, Department, TenantDomain, TenantSetting, TenantBranding · Identity: User, Membership,
BranchMembership, Role, Permission, RoleAssignment, Invitation, AuthSession · Targeting: Group, GroupMember ·
Content: Category, Tag, Course, CourseVersion, Module, Lesson, Asset, CompletionPolicy · Learning: Assignment,
AssignmentTarget, Enrollment, EnrollmentEvent, LessonProgress, LearningEvent · Assessment: QuestionBank, Question,
QuestionOption, Assessment, AssessmentVersion, Attempt, Answer · Certification: CertificateTemplate (+ version),
CertificateAward · Compliance: TrainingRequirement, RequirementApplicability, ComplianceEvidence · Surveys: Survey,
SurveyVersion, SurveyQuestion, SurveyResponse, SurveyAnswer · Classroom: Venue, ClassSession, SessionInstructor,
SessionRegistration, AttendanceRecord · Commerce: Offer, Price, Order, OrderLine, PaymentAttempt, Refund,
ProviderEvent, Entitlement · Reporting: MetricDefinition, SavedReport, ReportRun, ReportExport · Platform: AuditEvent,
Job/Outbox, Notification, NotificationDelivery.

Name the classroom entity `ClassSession` (not `Session`) to avoid collision with auth sessions. Mark each model in
`docs/DOMAIN_MODEL.md` as global, tenant-owned or branch-scoped, with lifecycle states and immutability rules.
Do not map legacy `custom0`–`custom4`, generic `access` JSON, or plaintext legacy credential columns into the new model.

## 7. API conventions

REST `/api/v1`, JSON, OpenAPI generated from code. Standard error envelope
`{ error: { code, message, requestId, fieldErrors? } }`; 401/403/404/409/422 semantics as in `CLAUDE.md`. Cursor
pagination with bounded limits, allowlisted sorts, validated filters. Idempotency keys for assignment creation, order
creation, webhooks, certificate jobs. Optimistic concurrency on editable aggregates. State transitions are explicit
action endpoints. Representative routes (spec §17):

`POST /tenants` (platform) · `POST /branches` · `POST /invitations` · `POST /invitations/{token}/accept` ·
`POST /courses` · `POST /courses/{id}/versions/{vid}/publish` · `POST /assignments` · `POST /enrollments/{id}/progress`
· `POST /assessments/{id}/attempts` · `POST /attempts/{id}/submit` · `GET /public/certificates/{verificationId}` ·
`POST /class-sessions/{id}/attendance` · `POST /checkout/orders` · `POST /webhooks/payments/{provider}` ·
`POST /reports/{id}/exports`.

Branch-scoped routes take the branch as a filter or body field that is **validated against** the actor's scope;
tenant is never a path/body parameter for tenant users (platform routes under `/platform/tenants/{tenantId}` only).

## 8. UX and design

Follow `docs/UI_UX_SPECIFICATION.md` (canonical 46-screen inventory, layout system, design tokens, screen order) and
`.claude/rules/web.md`. Highlights: neutral light workspace, deep green primary actions, restrained amber for
warnings/highlights, dark green sidebar for authenticated workspaces, strong typography, consistent tables/filters/
status badges, loading/empty/error/permission states, confirmations for destructive actions, WCAG 2.2 AA target,
mobile-first learner flows. Reference images are direction, not data or requirements: never ship their fake metrics,
real third-party logos, or invented testimonials. Legacy screenshots are workflow evidence only.

## 9. Delivery phases (canonical numbering)

| Phase | Name | Release | Exit gate | Prompt |
|---|---|---|---|---|
| 0 | Discovery & plan | — | Owner reviews plan + open decisions; no app code yet | `prompts/phase-0-discovery.md` |
| 1 | Design system & UI foundations | — | Tokens, components, shell, 8 key screens on labelled demo data; reviewed | `prompts/phase-1-design-system.md` |
| 2 | Platform foundation | R1 | API + DB + auth + tenancy + RBAC + audit + CI; two-tenant/branch isolation tests pass | `prompts/phase-2-foundation.md` |
| 3 | People & course content | R2 | Invitations, groups, authoring, versioning, assets, catalog; admin publishes v1, learner discovers it | `prompts/phase-3-people-content.md` |
| 4 | Core learning lifecycle | R2 (MVP) | Assignment → learning → assessment → completion → certificate → report journey passes E2E | `prompts/phase-4-learning-lifecycle.md` |
| 5 | Training operations | R3 | Compliance, reports/exports, surveys, classroom, notifications; scoped evidence reconciles | `prompts/phase-5-operations.md` |
| 6 | Commerce & analytics | R4 | Verified payments, refunds, metric dictionary, governed reports; reconciliation + scope tests pass | `prompts/phase-6-commerce-analytics.md` |
| 7 | Production readiness | Launch | Security, a11y, performance, backup/restore, migration rehearsal, runbook; go/no-go signed | `prompts/phase-7-production-readiness.md` |

Mapping from older documents: Supplementary prompt phases 1–6 = phases 2–7 here; spec sprints 0–6 = phases 0, 2–7
here, with phase 1 (design system) added by v1.0 of this prompt. Phase 1 scaffolds only `apps/web` (+ `packages/ui`
if justified); the API and database arrive in phase 2.

**Work protocol per slice:** goal + acceptance criteria → files/modules → schema → domain + authorization → API →
UI → tests (including isolation) → `pnpm verify` → docs + `.env.example` → honest report → `docs/PROGRESS.md`.
One vertical slice at a time. Never a whole phase in one change.

## 10. Mandatory end-to-end journey (must eventually pass in a test environment)

1. Platform admin creates Tenant A and Tenant B with branches in each.
2. Tenant A admin invites a branch-scoped learner and an instructor; learner accepts once; replay and branch escalation fail.
3. Admin creates a course with lessons and an assessment and publishes version 1.
4. Admin assigns it to a group with a due date; retrying creates no duplicate enrollment.
5. Learner starts, leaves, resumes on another device, completes required lessons, fails then passes the assessment;
   both attempts remain in history.
6. Certificate is issued exactly once, downloads, verifies publicly, and points to the right learner + version.
7. Publishing version 2 leaves the existing enrollment on version 1.
8. Progress, compliance and reports agree with the underlying records.
9. Branch admin cannot see Tenant B or another branch's restricted records through any route, filter, cursor or export.
10. Instructor runs a classroom session, records attendance; the configured completion rule applies.
11. Learner submits an eligible survey; anonymity and visibility rules hold; response rate is correct.
12. Paid checkout grants access only after a verified, deduplicated provider event; a fake redirect grants nothing.
13. Refund follows the access policy and preserves learning evidence.
14. A saved custom report and its export enforce identical scope and filters.

## 11. Definition of Done (per phase)

Acceptance criteria implemented and tested · API authorization and tenant/branch negative tests pass · migrations run
on a clean database · loading/empty/error/validation/permission states work · no dead buttons or fake success ·
audit events for sensitive changes · lint, type-check, tests and production build pass (or failures reported with
reason) · docs, `.env.example` and CLAUDE.md commands current · open decisions and known gaps recorded ·
`qa-verifier` subagent has independently re-run the gates for phase exits.

## 12. Decisions that must not be invented

Record and ask (see `docs/DECISIONS.md` for IDs and current status): group assignment behaviour; version migration of
enrollments; completion policy and attendance; compliance due-soon thresholds and renewal; payment provider, markets,
currencies, tax/GST/invoices, refunds and access after refund; survey anonymity and visibility; public catalog and
custom domains; content standards (SCORM/xAPI); retention and deletion; certificate verification data; expected
volume and performance targets; auth approach and SSO; learning paths/programmes; review/approval workflow before
publish; multi-branch learners' reporting scope; subscription billing for tenants; supported languages.

## 13. Required repository documents

`README.md` · `CLAUDE.md` · `.env.example` · `docs/PROGRESS.md` · `docs/IMPLEMENTATION_PLAN.md` · `docs/DECISIONS.md`
· `docs/PRODUCT_REQUIREMENTS.md` · `docs/ARCHITECTURE.md` · `docs/DOMAIN_MODEL.md` · `docs/ROLE_PERMISSION_MATRIX.md` ·
`docs/UI_UX_SPECIFICATION.md` · `docs/API_SPECIFICATION.md` (+ generated OpenAPI) · `docs/ACCEPTANCE_TESTS.md` ·
`docs/METRICS.md` (by phase 5) · `docs/MIGRATION_MAPPING.md` (if migrating) · `docs/RUNBOOK.md` · seed data for ≥2
tenants clearly marked non-production · migrations · automated tests.

## 14. First instruction

Start with **Phase 0** using `prompts/phase-0-discovery.md`. Inspect the workspace and tools, read the documents it
lists, and produce the plan, decisions, screen inventory, domain model draft and the first vertical slice with
testable acceptance criteria. Do not generate application code in Phase 0. Never ask for production secrets.
