# Role & Permission Matrix — Phase 0 draft

Status: **Proposed** (Phase 0, 2026-10-20). Phase 2 slice 2.4 implements this as `apps/api/src/access/permissions.ts`
and a test fails if the two disagree. Defaults below follow MASTER_PROMPT §2 and spec §1.2. Where the old matrix said
"if granted", MVP default is **no** (fixed system roles, D-053); the owner can change a default here before 2.4.

## Scope codes

| Code | Meaning |
|---|---|
| **P** | Platform-wide (platform routes only, `/api/v1/platform/**`) |
| **T** | Whole active tenant |
| **S** | The scope the role is assigned at: whole tenant, or the assigned branch(es). Branch filters supplied by the client are **intersected** with S, never replace it |
| **B** | Assigned branch(es) only (Branch Admin is always branch-scoped) |
| **A** | Assigned resources only: Instructor → class sessions they instruct + their learners' records for those sessions/courses |
| **O** | Own records only |
| **SS** | Only inside an audited, time-boxed platform support session for that tenant (D-037); read-only unless stated |
| — | Denied (default) |

Roles: **PSA** Platform Super Admin · **TA** Tenant Admin · **BA** Branch Admin · **LM** Learning Manager (assigned at
tenant or branch scope) · **INS** Instructor · **LRN** Learner · **CV** Compliance Viewer/Auditor (read-only, tenant or
branch scope).

Every authenticated tenant member can: read/update own profile, list own memberships and switch tenant, read own
notifications. These are not listed per role.

## Permission keys × roles

| Permission key | What it allows | PSA | TA | BA | LM | INS | LRN | CV | Phase |
|---|---|---|---|---|---|---|---|---|---|
| `tenant.create` · `tenant.update` · `tenant.suspend` · `tenant.archive` | Tenant lifecycle | P | — | — | — | — | — | — | 2.2 |
| `tenant.read` | Tenant list/detail | P | own tenant | own tenant | own tenant | — | — | own tenant | 2.2 |
| `platform_user.manage` | Platform staff accounts + platform roles | P | — | — | — | — | — | — | 2.4 |
| `platform.support_access.start` | Open a support session into a tenant (D-037) | P | — | — | — | — | — | — | 2.4 |
| `platform.audit.read` | Platform audit log | P | — | — | — | — | — | — | 2.2 |
| `platform.settings.read` | Provider status and system settings, no secrets (UI #12; added 1.4, Proposed) | P | — | — | — | — | — | — | 7.4 |
| `tenant_settings.read` | Settings, branding | SS | T | B (read) | S (read) | — | — | S (read) | 2.5 |
| `tenant_settings.update` · `branding.update` | Change settings / branding | — | T | — | — | — | — | — | 2.5 / 3.8 |
| `branch.read` | Branch list/detail | SS | T | B | S | — | — | S | 2.2 |
| `branch.create` · `branch.update` · `branch.deactivate` | Branch lifecycle | — | T | — | — | — | — | — | 2.2 |
| `reference_data.manage` | Departments, job roles (D-047) | — | T | — | — | — | — | — | 2.5 |
| `user.read` | People list/detail | SS | T | B | S | A (own learners) | — | S | 2.5 |
| `user.update` · `user.deactivate` · `user.reactivate` | Profile fields, membership status | — | T | B | — | — | — | — | 2.5 |
| `membership.branch.manage` | Add/remove branch memberships | — | T | B (within own branches) | — | — | — | — | 2.5 |
| `role.assign` | Assign/revoke tenant roles (see granting rules) | — | T | B (LRN, INS only) | — | — | — | — | 2.4 |
| `invitation.create` · `invitation.read` · `invitation.revoke` | Invitations | — | T | B | — | — | — | — | 3.1 |
| `group.read` | Groups | — | T | B | S | — | — | S | 3.2 |
| `group.manage` · `group.member.manage` | Create/edit/archive groups, members | — | T | B | S | — | — | — | 3.2 |
| `catalog.manage` | Categories, tags | — | T | — | — | — | — | — | 3.3 |
| `course.read` | Admin course list incl. drafts | SS | T | B (read) | S (read) | A (read) | — | S (read) | 3.3 |
| `course.create` · `course.update` | Create course, edit drafts | — | T | — | — | — | — | — | 3.3 |
| `course.publish` · `course.archive` | Publish version / archive course | — | T | — | — | — | — | — | 3.6 |
| `course.review` | Approve review step (only if D-022) | — | T | — | — | — | — | — | 3.6 |
| `asset.upload` · `asset.read` | Upload assets / get signed URL | — | T | — | — | — | entitled lessons (O) | — | 3.4 |
| `catalog.browse` | Tenant catalog | — | T | B | S | A | O (entitled) | — | 3.7 |
| `enrollment.self_enroll` | Self-enroll where course allows (D-046) | — | — | — | — | — | O | — | 4.1 |
| `assignment.create` · `assignment.update` · `assignment.cancel` | Assign learning (targets within scope; tenant target needs T — D-045) | — | T | B | S | — | — | — | 4.1 |
| `enrollment.read` | Enrollments + "why it exists" | SS | T | B | S | A | O | S | 4.1 |
| `enrollment.cancel` · `enrollment.migrate_version` | Cancel / migrate (D-011) | — | T | B (cancel only) | S (cancel only) | — | — | — | 4.1 |
| `progress.record` | Record own learning progress | — | — | — | — | — | O | — | 4.3 |
| `assessment.manage` | Question bank, assessment builder | — | T | — | — | — | — | — | 4.4 |
| `attempt.take` | Start/submit own attempts | — | — | — | — | — | O | — | 4.4 |
| `attempt.review` | View attempt results | SS | T | B | S | A | O | S | 4.4 |
| `attempt.answer_key.read` | See correct answers (D-023) | — | T | — | S | A | per D-023 | — | 4.4 |
| `attempt.grade_override` | Override a grade (audited) | — | T | — | — | — | — | — | later |
| `certificate_template.manage` | Templates | — | T | — | — | — | — | — | 4.6 |
| `certificate.read` | Search issued certificates | SS | T | B | S | A | O | S | 4.6 |
| `certificate.revoke` · `certificate.reissue` | Revoke / reissue (reason) | — | T | — | — | — | — | — | 4.6 |
| `report.read` | Basic + compliance reports | SS | T | B | S | A | — | S | 4.7 |
| `report.export` | CSV exports | — | T | B | S | — | — | S | 5.3 |
| `compliance.manage` | Training requirements | — | T | — | — | — | — | — | 5.1 |
| `compliance.read` | Compliance status + evidence | SS | T | B | S | — | O | S | 5.1 |
| `survey.manage` · `survey.results.read` | Builder, aggregated results | — | T | — | S (results) | A (own session surveys, results) | — | S (results) | 5.4 |
| `survey.free_text.read` | Free-text answers (D-020) | — | T | — | — | — | — | — | 5.4 |
| `survey.respond` | Respond to eligible surveys | — | — | — | — | — | O | — | 5.4 |
| `class_session.manage` | Create/edit/cancel sessions, venues | — | T | B | S | A (own sessions: edit, not create) | — | — | 5.5 |
| `class_session.register` | Register/cancel own registration | — | — | — | — | — | O | — | 5.5 |
| `attendance.record` | Record/edit attendance (audited) | — | T | B | — | A | — | — | 5.5 |
| `notification_template.manage` | Tenant notification templates | — | T | — | — | — | — | — | 5.6 |
| `offer.manage` | Offers, prices | — | T | — | — | — | — | — | 6.1 |
| `order.read` · `order.refund` | Orders, reconciliation, refunds | P (read, billing scope) | T | — | — | — | O (read own) | — | 6.1–6.3 |
| `analytics.read` · `saved_report.manage` | Dashboards, governed builder | P (platform metrics) | T | B | S | — | — | S (read) | 6.4–6.5 |
| `audit.read` | Tenant audit log | SS | T | B | — | — | — | S | 2.6 |

## Granting rules (enforced in the access service, tested in 2.4)

1. Deny by default: a route without `@RequirePermission` (or `@Public`) fails a test.
2. Nobody can assign a role they do not hold at an equal or wider scope. Tenant Admin can assign every tenant role at
   tenant or branch scope. Branch Admin can assign only **Learner** and **Instructor**, only within their branches.
3. Nobody can create, modify or revoke their own role assignments.
4. Platform roles are assigned only by PSA through platform routes; tenant actors can never reference platform roles.
5. A branch-scoped role cannot be widened by editing IDs, filters, cursors or payloads (isolation suite).
6. Removing a role assignment revokes the permissions on the next request; history stays in AuditEvent.
7. Platform staff have **no** implicit tenant access. Tenant data is reachable only inside a support session (D-037):
   reason required, time-boxed, banner shown to the staff user, every action audited with the session id.

## Enforcement so far

- Slice 2.2: `tenant.create`, `tenant.read`, `tenant.update`, `tenant.suspend` (suspend and reactivate),
  `tenant.archive` on `/api/v1/platform/tenants/**` (platform scope); `branch.read`, `branch.create`, `branch.update`,
  `branch.deactivate` (deactivate and reactivate) on `/api/v1/branches/**` (tenant scope; Branch Admin reads only
  their own branches). Registry: `apps/api/src/access/permissions.ts` (a test fails if a key is missing here). A
  global guard denies every route that is neither `@Public()` nor tied to a permission. Callers come from sessions
  from Slice 2.3; until then protected routes answer 401.
- Slice 2.3b: callers are identified by their session; `@Authenticated()` routes (`/auth/me`, `/auth/logout`) need no
  permission. Nobody holds a platform or tenant permission until roles and memberships (2.4), so every permission
  route answers 403 to signed-in users.

## Notes and open points

- D-026 decides how "B" applies to learners in several branches (Proposed: any of the learner's branches).
- D-053: custom tenant roles are a Candidate; this table is the whole MVP permission model.
- Compliance Viewer is strictly read-only: no `*.manage`, `*.create`, `*.update`, `*.cancel`, `*.revoke` keys.
- Instructor "permitted content editing" (UI screen 36) is **off** by default; enabling it is an owner decision.
