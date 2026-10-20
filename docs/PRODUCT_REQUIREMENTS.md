# VacheLearn Product Requirements — Phase 0

Status: **Proposed** (Phase 0, 2026-10-20). The spec (`docs/MVP_SPEC.md`, from the .docx) is authoritative for
requirement wording; this file adds personas, the release boundary, and an index that gives every spec acceptance
criterion (AC) a stable ID so plans, tests and reports can cite it.

## 1. Vision

VacheLearn is a multi-tenant industrial learning and workforce-readiness platform: organisations manage people across
branches, deliver online and instructor-led training, assess competency, issue verifiable certificates and track
mandatory compliance. Journey: **Learn → Practice → Prove → Certify → Improve.** Optimise for tenant isolation,
trustworthy learning evidence, accessibility and low fixed cost during POC/MVP.

## 2. Personas

| Persona | Role | Goal | Pain today | Must be able to |
|---|---|---|---|---|
| Platform operator | Platform Super Admin | Onboard and support tenant organisations safely | Support needs access without silent impersonation | Create/suspend tenants, see platform health and usage, open an audited support session |
| Head of L&D at a manufacturer | Tenant Admin | One governed training system for every plant | Evidence scattered across spreadsheets | Configure tenant, branches, people, roles, courses, assignments, certificates, reports |
| Plant / site HR or training coordinator | Branch Admin | Keep their site's people trained and audit-ready | Cannot see who is overdue at their site | Manage site people and groups, assign, chase overdue, export site reports — and nothing outside the site |
| Training manager | Learning Manager | Plan and monitor learning across teams | No reliable completion numbers | Assign, monitor progress and compliance within scope |
| Trainer | Instructor | Run sessions and record attendance accurately | Paper rosters | See own sessions, roster, mark attendance, review results for own learners |
| Shop-floor operator / technician | Learner | Finish required training quickly, often on a phone | Hard-to-use portals, lost progress | See what is due, learn on mobile, resume anywhere, pass assessments, download certificates |
| Safety / quality auditor | Compliance Viewer | Prove who is trained and certified | Evidence cannot be trusted or exported | Read requirements, status and evidence; export audit-ready reports; change nothing |

## 3. Release boundary

| Release | Phases | Contents | Exit |
|---|---|---|---|
| — | 0–1 | Plan, decisions, design system, shell, 8 key screens on labelled demo data | Owner review; nothing counted as working |
| **R1 Foundation** | 2 | Tenants, branches, identity, auth, memberships, fixed roles, audit, CI, isolation suite | Two-tenant/branch isolation proven |
| **R2 Core learning MVP** | 3–4 | Invitations, groups, catalog, authoring, versioning, assets, branding, assignments, player, progress, assessments, completion, certificates, basic reports | Learner assigned → completes → passes → certified → visible in reports |
| **R3 Operational** | 5 | Compliance rules, compliance reports, CSV exports, surveys, classroom + attendance, notifications, (bulk import per D-044) | Online + instructor-led evidence tracked against requirements |
| **R4 Commercial & analytics** | 6 | Offers, checkout, verified webhooks, refunds, reconciliation, metric dictionary, governed reports | Payments reconcile; analytics scoped |
| Launch | 7 | Security, accessibility, performance, operations, (migration per D-036) | Go/no-go signed |

### In scope (MVP = R1 + R2)

Everything in R1 and R2 above, at the depth set by the spec ACs indexed below, with lesson types text, video, document,
link and quiz/assessment, and question types single choice, multiple select and true/false.

### Out of scope until separately approved

SCORM/xAPI/AICC/cmi5 (D-012) · arbitrary SQL reports · storing card data · microservices · reproducing legacy tables or
screens · every candidate in D-043 (gamification, ratings, discussions, notes, announcements, mentor role, lesson
resources, bookmarks, module-level due dates, course import, branch maps, platform content library, page builder,
coupons, custom roles, CEU, skills, e-signature, observation checklists, manager approval, VC integrations, SSO,
native apps) · learning paths (D-025) · tenant subscription billing (D-027) · legacy migration (D-036).

## 4. Requirements index

ID format `REQ-<area>-<n>` = the n-th **AC** bullet of that spec section, in document order. Areas follow MASTER_PROMPT
§3 letters (A–L) plus cross-cutting X. "Slice" is where the AC is first proven by a test (see
`docs/IMPLEMENTATION_PLAN.md`). 104 ACs in total.

### X — Tenant isolation (spec §3.1)

| ID | Acceptance criterion (short) | Release | Slice |
|---|---|---|---|
| REQ-X-ISO-1 | Every request resolves user + active membership; no membership → rejected | R1 | 2.4 |
| REQ-X-ISO-2 | Every tenant-owned read/write scoped to resolved tenant in services | R1 | 2.2–2.6 |
| REQ-X-ISO-3 | Branch operations verify branch membership/permission | R1 | 2.4 |
| REQ-X-ISO-4 | Cross-tenant references rejected by DB or service | R1 | 2.2 (pattern), every slice |
| REQ-X-ISO-5 | Tests tamper IDs, filters, cursors, export URLs; all fail without leaks | R1 | 2.6, every slice |
| REQ-X-ISO-6 | If RLS: transaction-local context, no pooled leakage | Launch | 7.1 (optional) |

### A — Tenancy and branches (spec §4)

| ID | Acceptance criterion (short) | Release | Slice |
|---|---|---|---|
| REQ-A-1 | Duplicate tenant slug → field-level error | R1 | 2.2 |
| REQ-A-2 | Tenant admin cannot create/update another tenant's branch | R1 | 2.2 / 2.6 |
| REQ-A-3 | Branch code unique within tenant | R1 | 2.2 |
| REQ-A-4 | Renaming tenant leaves ids and certificate evidence unchanged | R1 (+R2 cert check) | 2.2, 4.6 |
| REQ-A-5 | Suspension effective next request, audited with actor/reason/time | R1 | 2.2, 2.3 |
| REQ-A-6 | Lists/dashboards show only records in role scope | R1 | 2.5, 2.6 |

### B — Users, groups, invitations, roles (spec §5)

| ID | Acceptance criterion (short) | Release | Slice |
|---|---|---|---|
| REQ-B-1 | Invitation accepted once, expires, bound to tenant + email | R2 | 3.1 |
| REQ-B-2 | Existing account gains only the invited membership | R2 | 3.1 |
| REQ-B-3 | No self-elevation, platform-role assignment or branch-scope expansion | R1 | 2.4 |
| REQ-B-4 | Deactivation blocks new sessions, revokes active ones within window (D-049) | R1 | 2.3 |
| REQ-B-5 | Removing group member changes future targeting, keeps history | R2 | 3.2, 4.1 |
| REQ-B-6 | Role/permission/membership changes audited | R1 | 2.4 |
| REQ-B-7 | Import preview valid/invalid/duplicate; idempotent commit | R3 (D-044) | 5.7 |

### C — Courses and authoring (spec §6)

| ID | Acceptance criterion (short) | Release | Slice |
|---|---|---|---|
| REQ-C-1 | Draft visible only to content managers; not assignable/purchasable | R2 | 3.3 |
| REQ-C-2 | Publish creates stable version number with publisher/time | R2 | 3.6 |
| REQ-C-3 | Enrolled learners keep their version unless explicitly migrated | R2 | 4.1 |
| REQ-C-4 | Reorder persists and drives player order | R2 | 3.5 |
| REQ-C-5 | Broken asset → recoverable error, no completion | R2 | 3.5, 4.3 |
| REQ-C-6 | Search/filters return only entitled items | R2 | 3.7 |
| REQ-C-7 | Archive blocks new enrollment, preserves history | R2 | 3.6 |

### D — Assignments and enrollments (spec §7)

| ID | Acceptance criterion (short) | Release | Slice |
|---|---|---|---|
| REQ-D-1 | Targets validated as same tenant and in actor scope | R2 | 4.1 |
| REQ-D-2 | Group assignment enrolls current members; later members per D-004 | R2 | 4.1 |
| REQ-D-3 | No duplicate active enrollment, or defined reuse policy (D-045) | R2 | 4.1 |
| REQ-D-4 | Past due date rejected or confirmed, consistently (D-032) | R2 | 4.1 |
| REQ-D-5 | Learner filters: assigned, in progress, completed, overdue | R2 | 4.2 |
| REQ-D-6 | Cancellation stops progress, keeps evidence | R2 | 4.1 |
| REQ-D-7 | Admin sees why an enrollment exists | R2 | 4.1 |

### E — Learner dashboard and player (spec §8)

| ID | Acceptance criterion (short) | Release | Slice |
|---|---|---|---|
| REQ-E-1 | Learner sees only own enrollments/progress | R2 | 4.2 |
| REQ-E-2 | Opening a lesson does not complete it unless rule says so | R2 | 4.3 |
| REQ-E-3 | Progress survives refresh, logout/login, device change | R2 | 4.3 |
| REQ-E-4 | Media failure → recoverable message, no false completion | R2 | 4.3 |
| REQ-E-5 | Keyboard, focus, labels, text alternatives on learning controls | R2 | 4.3 (+1.5.5) |
| REQ-E-6 | UI distinguishes completion, pass, certificate | R2 | 4.2–4.6 |

### F — Assessments and progress (spec §9)

| ID | Acceptance criterion (short) | Release | Slice |
|---|---|---|---|
| REQ-F-1 | Cannot submit for an assessment version not entitled | R2 | 4.4 |
| REQ-F-2 | Attempt + time limits enforced server-side incl. concurrent tabs | R2 | 4.4 |
| REQ-F-3 | Retry creates new attempt, never overwrites | R2 | 4.4 |
| REQ-F-4 | Score + pass/fail consistent with threshold and rounding (D-042) | R2 | 4.4 |
| REQ-F-5 | Progress % from required items only | R2 | 4.3, 4.5 |
| REQ-F-6 | Duplicate completion events → no duplicate certificates/analytics | R2 | 4.5, 4.6 |
| REQ-F-7 | Staff review results; answer-key visibility by policy (D-023) | R2 | 4.4 |

### G — Certificates (spec §10)

| ID | Acceptance criterion (short) | Release | Slice |
|---|---|---|---|
| REQ-G-1 | No certificate when conditions unmet | R2 | 4.6 |
| REQ-G-2 | One award per course/version/renewal cycle | R2 | 4.6 |
| REQ-G-3 | PDF has correct learner, course, dates, branding, id | R2 | 4.6 |
| REQ-G-4 | Public verification minimal data only (D-017) | R2 | 4.6 |
| REQ-G-5 | Revoked shows as revoked | R2 | 4.6 |
| REQ-G-6 | Template change does not alter issued artifact without reissue | R2 | 4.6 |

### H — Compliance and reports (spec §11)

| ID | Acceptance criterion (short) | Release | Slice |
|---|---|---|---|
| REQ-H-1 | Explicit due/expiry rules with boundary-date tests | R3 | 5.1 |
| REQ-H-2 | Completing a requirement updates status, keeps earlier evidence | R3 | 5.1 |
| REQ-H-3 | Branch admin cannot export another branch | R3 | 5.3 |
| REQ-H-4 | Report totals reconcile with filtered records | R2 (basic) / R3 | 4.7, 5.2 |
| REQ-H-5 | CSV = on-screen filters + authorization; formula-injection safe | R3 | 5.3 |
| REQ-H-6 | Large exports async; failures visible and retryable | R3 | 5.3 |

### I — Surveys (spec §12)

| ID | Acceptance criterion (short) | Release | Slice |
|---|---|---|---|
| REQ-I-1 | Responses only within audience, window, tenant | R3 | 5.4 |
| REQ-I-2 | Required questions validated server-side | R3 | 5.4 |
| REQ-I-3 | Duplicates prevented unless allowed | R3 | 5.4 |
| REQ-I-4 | Anonymous responses store no identifier; metadata cannot re-identify | R3 | 5.4 |
| REQ-I-5 | Response count and rate vs eligible audience | R3 | 5.4 |
| REQ-I-6 | Closing/archiving keeps responses | R3 | 5.4 |

### J — Classroom (spec §13)

| ID | Acceptance criterion (short) | Release | Slice |
|---|---|---|---|
| REQ-J-1 | End > start; capacity ≥ 0; instructor has access | R3 | 5.5 |
| REQ-J-2 | Capacity not exceeded unless waitlist (D-019) | R3 | 5.5 |
| REQ-J-3 | Only authorized staff change attendance; audited | R3 | 5.5 |
| REQ-J-4 | Cancelled session not completable without reopen | R3 | 5.5 |
| REQ-J-5 | Attendance affects completion only per policy | R3 | 5.5 |
| REQ-J-6 | Times displayed in configured timezone, stored UTC | R3 | 5.5 |

### K — Commerce (spec §14)

| ID | Acceptance criterion (short) | Release | Slice |
|---|---|---|---|
| REQ-K-1 | Tampered return URL / fake success grants nothing | R4 | 6.2 |
| REQ-K-2 | Duplicate webhook → no duplicate order, charge or enrollment | R4 | 6.2 |
| REQ-K-3 | Amount + currency computed server-side | R4 | 6.1 |
| REQ-K-4 | No card number or CVV stored | R4 | 6.2 |
| REQ-K-5 | Paid order grants the right tenant/course/version/user | R4 | 6.2 |
| REQ-K-6 | Refund and failure visible to learner/admin; audited | R4 | 6.3 |
| REQ-K-7 | Tax, invoice, refund, consumer-law rules validated per market before production | R4 / Launch | 6.1, 7.6 (owner + counsel) |

### L — Analytics and custom reports (spec §15)

| ID | Acceptance criterion (short) | Release | Slice |
|---|---|---|---|
| REQ-L-1 | Dashboard metric = filtered report within refresh window | R4 | 6.4 |
| REQ-L-2 | All analytics, saved reports and exports enforce scope | R4 | 6.4, 6.5 |
| REQ-L-3 | Saved report not shareable beyond recipient's access | R4 | 6.5 |
| REQ-L-4 | Invalid filters/ranges → understandable validation errors | R4 | 6.5 |
| REQ-L-5 | Export = report data, records requester/scope/time | R4 | 6.5 |
| REQ-L-6 | Metric definitions documented/version-controlled | R4 | 6.4 (METRICS.md from 5) |

### X — UX and accessibility (spec §16)

| ID | Acceptance criterion (short) | Release | Slice |
|---|---|---|---|
| REQ-X-UX-1 | Every list: loading, empty, error, permission-denied states | All | 1.3, every UI slice |
| REQ-X-UX-2 | Destructive actions confirm and state impact | All | 1.3 |
| REQ-X-UX-3 | Client + server validation | All | 1.3, 2.1 |
| REQ-X-UX-4 | Consistent pagination/sort/filter; server limits | All | 1.3, 2.1 |
| REQ-X-UX-5 | Keyboard operable, visible focus, labelled controls | All | 1.3–1.5, 7.2 |
| REQ-X-UX-6 | Status by text + colour; charts with table equivalents | All | 1.3 |
| REQ-X-UX-7 | Mobile widths; learner journey not desktop-only | All | 1.4, 1.5, 4.3 |
| REQ-X-UX-8 | Dates in selected timezone/locale; money shows currency | All | 1.5 (D-034), 2.5 |

### X — Background jobs (spec §18)

| ID | Acceptance criterion (short) | Release | Slice |
|---|---|---|---|
| REQ-X-JOB-1 | Every job has a business key / idempotency strategy | R1 | 2.3a (runner) |
| REQ-X-JOB-2 | Retries never duplicate enrollments, certificates, payments, notifications | R2–R4 | 4.1, 4.6, 5.6, 6.2 |
| REQ-X-JOB-3 | Job status queued/running/succeeded/failed/retrying, sanitised errors | R1 | 2.3a |
| REQ-X-JOB-4 | Long work never blocks request threads | R2–R3 | 4.6, 5.3 |

### X — Definition of Done and release gates (spec §21)

| ID | Acceptance criterion (short) | Release | Slice |
|---|---|---|---|
| REQ-X-DOD-1 | All Must requirements have passing acceptance tests | Each release | Phase exits |
| REQ-X-DOD-2 | No open critical/high isolation, escalation, payment, certificate defects | Each release | Phase exits, 7.1 |
| REQ-X-DOD-3 | Migrations versioned, repeatable on clean DB, tested on representative data | Each release | Every schema slice, 7.3 |
| REQ-X-DOD-4 | Staging production-like with separate secrets + rollback path | Launch | 7.4 |
| REQ-X-DOD-5 | Backup + restore executed in non-production | Launch | 7.4 |
| REQ-X-DOD-6 | Structured logs, request ids, error monitoring, alerts | R1 → Launch | 2.1, 7.4 |
| REQ-X-DOD-7 | Accessibility + responsive checks on primary journeys | Each release | 1.5, 7.2 |
| REQ-X-DOD-8 | API docs, env setup, seed, runbook, limitations current | Each release | Every slice |
| REQ-X-DOD-9 | Owner signs off unresolved policy choices | Each release | Owner queue in DECISIONS |

Count check: 6 + 6 + 7 + 7 + 7 + 6 + 7 + 6 + 6 + 6 + 6 + 7 + 6 + 8 + 4 + 9 = **104**.

## 5. Phase 0 reconciliation log

Contradictions and gaps found between MASTER_PROMPT, the spec, the docs, the phase prompts and the reference images.
Precedence rule (MASTER_PROMPT): Confirmed decisions → MASTER_PROMPT → spec → other docs → images/legacy. Resolutions
are **Proposed** until the owner confirms them.

| # | Found | Proposed resolution |
|---|---|---|
| 1 | Spec §17 `POST /tenants/{tenantId}/branches` puts the tenant in the path; MASTER_PROMPT §7 forbids that for tenant users | Tenant users: `POST /api/v1/branches` (tenant from session). Platform: `/api/v1/platform/tenants/{tenantId}/branches` |
| 2 | Verification route: spec `GET /certificates/{id}/verify` vs MASTER_PROMPT `GET /public/certificates/{verificationId}` | MASTER_PROMPT form; web page `/verify/[verificationId]` |
| 3 | Attendance route: spec `/sessions/{id}/attendance` vs MASTER_PROMPT `/class-sessions/{id}/attendance` | `/class-sessions/…` (avoids the auth-session name clash) |
| 4 | Entity names differ (spec `ProgressRecord`, `SessionEnrollment`, `InstructorAssignment`, `GradingResult`, `ContentProviderRef`; Group under identity) | Mapped in `docs/DOMAIN_MODEL.md` §1; MASTER_PROMPT names win |
| 5 | Assignment targets: spec allows tenant cohorts, MASTER_PROMPT says branch cohorts | D-045 (Needs decision, default Proposed) |
| 6 | Bulk import has a spec AC but no phase | D-044; slice 5.7 added to `prompts/phase-5-operations.md` |
| 7 | Spec §1.3 puts the storage abstraction in the Foundation release; the plan builds it in 3.4 | Keep 3.4 — no R1 feature stores files; flagged so the owner can object |
| 8 | Spec §1.3 puts a deployment pipeline in Foundation; MASTER_PROMPT puts deployment in Phase 7 (host D-015 open) | CI from 1.1/2.6; deployment pipeline in 7.4 once D-015 is decided |
| 9 | No slice built the job runner before Phase 3, yet 2.3 sends verification/reset email | Slice 2.3a added to `prompts/phase-2-foundation.md`; D-040 now blocks P2 |
| 10 | Certificates need tenant branding (spec §10 AC 3) but no slice built branding | Slice 3.8 added to `prompts/phase-3-people-content.md` |
| 11 | Enrollment "Overdue" is a status in MASTER_PROMPT but is time-dependent | D-054: derived at read time, not stored |
| 12 | Spec §14 lists `authorized/processing` order states; UI status vocabulary has none | Add a "Processing" label in Phase 6 only if the chosen provider has that state |
| 13 | Learner dashboard "Upcoming/instructor-led" (spec §8) before classroom exists (R3) | Section hidden until the classroom flag is on |
| 14 | "Available learning" (spec §8, images) needs a self-enrollment rule | D-046 |
| 15 | Old permission matrix says "if granted" without a mechanism to grant | D-053 fixed roles; defaults set in `docs/ROLE_PERMISSION_MATRIX.md` |
| 16 | Learning Manager "manages programmes", but programmes are not specified | No programme permission until D-025 is decided |
| 17 | D-035 was scheduled for Phase 2, but Phase 1 already defines the typed API contracts | D-035 now blocks P1 slice 1.5; recommendation Zod + `packages/contracts` |
| 18 | Screen inventory missed workspace picker, commerce admin, learner orders, analytics builder, export jobs, categories, departments/job roles, notification templates, support access, system states, design gallery, branch comparison | Screens 47–58 added to `docs/UI_UX_SPECIFICATION.md` |
| 19 | Reference images show Notices/announcements, Mentor role, module-level due dates, lesson resources, bookmarks, course import, branch map, platform content library, page builder, coupons, industry widget, ratings, achievements | Out of scope; listed in D-043 (and D-048 for industry); regions omitted, not shipped inert |
| 20 | Phase 0 prompt asks to add a "Blocks phase" column to DECISIONS — it already existed | No change needed |
| 21 | Whether the first production launch is after R2 (MVP) or after R4 is not stated | D-057 (Needs decision) |
| 22 | Spec §3 lists `Group` with identity and `Session` for both auth and classroom | `ClassSession` / `AuthSession`; Group sits in targeting (MASTER_PROMPT) |
