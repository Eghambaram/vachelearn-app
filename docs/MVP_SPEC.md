# VacheLearn MVP Implementation Specification (Markdown copy)

> Generated from `VacheLearn_MVP_Implementation_Specification.docx` so Claude Code can read it directly. The .docx is the original; if they differ, the .docx wins and this file should be regenerated (`pandoc VacheLearn_MVP_Implementation_Specification.docx -t gfm --wrap=none -o MVP_SPEC.md`).

**VACHELEARN — MVP Implementation Specification**

*Functional requirements • Technical design • Acceptance criteria • Release gates*

| **Document field** | **Value**                                                         |
|--------------------|-------------------------------------------------------------------|
| Product            | VacheLearn — Industrial & Technology Workforce Readiness Platform |
| Version            | 1.0 — implementation baseline                                     |
| Status             | Draft for product/engineering validation                          |
| Audience           | Product owner, engineering, QA, UX, DevOps, migration team        |
| Scope              | All 12 requested capability areas; staged delivery recommended    |

# How to use this specification

- Treat each acceptance criterion as a testable requirement, not as a visual suggestion.

- Build tenant isolation, authorization, auditability and content versioning into the foundation; they are not later enhancements.

- Use feature flags or release configuration to stage classroom, commerce and advanced analytics without creating separate architectures.

- Legacy screenshots and ERD establish a useful capability inventory, but do not prove every hidden business rule, API behavior or integration. Verify those items before migration.

- Any behavior not explicitly defined here must be recorded as a product decision rather than inferred from a legacy database field.

# 1. Product outcomes and scope

## 1.1 Product outcomes

- Give industrial organizations one governed platform to train employees across multiple branches and departments.

- Allow administrators to assign required learning, monitor completion and produce auditable evidence.

- Provide a learner experience that works on desktop, tablet and mobile browsers.

- Support self-paced digital learning and instructor-led classroom sessions in the same learning record.

- Enable organizations to publish courses, optionally sell paid enrollment, and analyze learning and compliance outcomes.

- Keep platform operating costs low during the POC/MVP and scale services only when usage justifies it.

## 1.2 Roles in scope

| **Role**                  | **Default scope**                | **Core capabilities**                                                                                                 |
|---------------------------|----------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| Platform Super Admin      | Platform-wide                    | Create/suspend tenants, manage platform settings, view platform-level usage and operational audit.                    |
| Tenant Admin              | One tenant                       | Manage tenant settings, branches, memberships, groups, courses, assignments, reports and commerce configuration.      |
| Branch Admin              | Assigned branches                | Manage branch users/groups, branch learning operations and scoped reports.                                            |
| Learning Manager          | Tenant or assigned branches      | Create assignments, monitor progress, manage learning programmes and compliance reports.                              |
| Instructor                | Assigned courses/sessions        | Manage assigned sessions, rosters, attendance, course content where permitted, assessments and feedback.              |
| Learner                   | Own account and learning records | Discover eligible courses, learn, attend sessions, take assessments, submit surveys and download earned certificates. |
| Compliance Viewer/Auditor | Read-only scoped access          | View requirements, evidence, overdue items, completion records and audit exports.                                     |

## 1.3 Release strategy

| **Release**              | **Required contents**                                                                                                                        | **Exit condition**                                                                                |
|--------------------------|----------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------|
| Foundation               | Tenants, branches, identity, memberships, scoped roles, audit trail, storage abstraction, deployment pipeline.                               | Isolation and authorization tests pass; a tenant cannot access another tenant's records.          |
| Core learning MVP        | Groups, invitations, catalog, course authoring, assignments/enrollments, learner player, assessments, progress, certificates, basic reports. | A learner can be assigned, complete, pass, receive a certificate and appear correctly in reports. |
| Operational learning     | Compliance rules, surveys, classroom sessions, attendance and instructor workflows.                                                          | Required training can be tracked for both online and instructor-led delivery.                     |
| Commercial and analytics | Paid enrollment, payment/refund states, revenue reconciliation, saved reports and advanced analytics.                                        | Payment lifecycle is auditable; reports reconcile to source records and enforce scope.            |

# 2. Architecture and engineering standards

## 2.1 Recommended implementation

| **Layer**       | **Baseline**                                                                       | **Implementation notes**                                                                                                         |
|-----------------|------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| Web application | Next.js + TypeScript                                                               | Responsive admin, learner, public catalog and tenant-branded experiences; server-side checks must not replace API authorization. |
| API             | NestJS + TypeScript                                                                | Modular monolith with modules and domain services; version API contracts and centralize authorization.                           |
| Database        | PostgreSQL                                                                         | Relational integrity, migrations, transactions, scoped indexes and optional row-level security as defense in depth.              |
| ORM             | Prisma or Drizzle; select one                                                      | Use migrations and explicit transactions. Avoid mixing ORM patterns in one codebase.                                             |
| File storage    | S3-compatible StorageService abstraction                                           | MinIO for development/staging; AWS S3 production target; keep provider switchable for R2 or alternatives.                        |
| Video           | VideoProvider abstraction; Cloudflare Stream may be used                           | API owns authorization, enrollment and progress. Provider handles encoding/streaming; signed playback where available.           |
| Async work      | Start with a database-backed job/outbox where sufficient; Redis/BullMQ when needed | Use for email, report exports, certificate generation and payment webhooks; jobs must be retry-safe.                             |
| Operations      | Docker-compatible deploy, CI/CD, structured logs, error monitoring and backups     | Separate staging/production secrets; define health checks and restore tests.                                                     |

## 2.2 Non-negotiable engineering rules

- Use UUID primary keys for new domain records unless an external provider requires its own identifier.

- Every tenant-owned record must carry a tenant ownership path that can be validated in the database and service layer.

- Use tenant context derived from authenticated membership, never trust a client-supplied tenant_id without authorization.

- Branch-scoped users must not gain tenant-wide access by changing a URL, query parameter, object ID or API payload.

- Use explicit status enums and timestamps rather than implicit booleans or overloaded custom fields.

- Published course versions are immutable. Editing a published course creates a new draft/version.

- Use idempotency keys or unique provider event IDs for payment and webhook processing.

- Store timestamps in UTC; render using the tenant/user's configured timezone.

- Record security-sensitive changes in an append-only audit event stream.

- Do not log passwords, session tokens, payment secrets, signed URLs or sensitive learner answers.

# 3. Domain model and data boundaries

| **Domain**               | **Core entities**                                                                                             | **Key rules**                                                                                                           |
|--------------------------|---------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| Tenancy                  | Tenant, Branch, Department, TenantDomain, TenantSetting                                                       | Tenant owns branches; branch code unique within tenant; tenant status gates access.                                     |
| Identity & access        | User, Membership, BranchMembership, Group, GroupMember, Role, Permission, RoleAssignment, Invitation, Session | Global user identity can join multiple tenants; tenant/branch memberships determine scope; role assignment has scope.   |
| Learning content         | Course, CourseVersion, Module, Lesson, Asset, Category, Tag, ContentProviderRef                               | Drafts editable; published version immutable; assets use storage abstraction.                                           |
| Learning operations      | Assignment, AssignmentTarget, Enrollment, EnrollmentEvent, ProgressRecord, LearningEvent                      | Assignment target may be user, group, branch or tenant cohort; materialize effective enrollments with idempotency.      |
| Assessment               | Assessment, Question, QuestionOption, AssessmentVersion, Attempt, Answer, GradingResult                       | Snapshot assessment version per attempt; server validates answers and computes scores.                                  |
| Certification/compliance | CertificateTemplate, CertificateAward, TrainingRequirement, RequirementApplicability, ComplianceEvidence      | Certificate references learner, course version, completion evidence and issue date; revocation is tracked, not deleted. |
| Surveys                  | Survey, SurveyVersion, SurveyQuestion, SurveyResponse, SurveyAnswer                                           | Response visibility and anonymity rules are explicit; survey version frozen after launch.                               |
| Classroom                | Session, SessionEnrollment, AttendanceRecord, InstructorAssignment, Venue/MeetingLink                         | Session capacity and attendance changes are auditable; attendance is not silently equivalent to course completion.      |
| Commerce                 | Product/Offer, Price, Order, OrderLine, PaymentAttempt, Refund, ProviderEvent                                 | Order and payment states separate; webhook processing idempotent; no raw card data stored.                              |
| Reporting                | SavedReport, ReportRun, ReportExport, MetricDefinition                                                        | Reports enforce tenant and branch scopes; export access is audited.                                                     |

## 3.1 Tenant isolation model

- **AC:** Every request resolves an authenticated user and the active tenant membership; requests without valid membership are rejected.

- **AC:** Every tenant-owned read and write is scoped to the resolved tenant in the service layer.

- **AC:** Branch-scoped operations additionally verify branch membership/permissions.

- **AC:** Cross-tenant references are rejected by database constraints or service validation; a tenant cannot attach another tenant's course, user, branch, order or certificate.

- **AC:** Automated tests attempt cross-tenant access by changing IDs, filters, pagination cursors and export URLs; all attempts fail without leaking record details.

- **AC:** If PostgreSQL RLS is enabled, tenant context is set transaction-locally and cannot leak across pooled connections; application authorization remains mandatory.

## 3.2 Core relationship sketch

**Tenant → Branches / Departments → Memberships / Groups → Assignments → Enrollments → Progress / Attempts → Certificate / Compliance evidence**

**Tenant → Course → CourseVersion → Modules / Lessons / Assets / Assessments**

**Tenant → Offer / Price → Order → PaymentAttempt / Refund → Enrollment entitlement**

Treat this as a conceptual relationship map, not a final migration DDL. Physical schema, indexes, deletion rules and legacy field mappings must be confirmed during database design.

# 4. Multi-tenant and branch management

Purpose: isolate organizations while allowing one tenant to manage multiple locations.

## Functional requirements

- Platform admin can create, edit, activate, suspend and archive tenants; required fields include display name, unique slug, status and default timezone.

- Tenant admin can create/edit branches with unique branch code within the tenant, name, address/location, timezone and status.

- Tenant admin can assign branch administrators and map users to one or more branches, subject to role permissions.

- Tenant settings include branding basics, locale/timezone, learning defaults and optional public catalog settings.

- Suspended tenant blocks tenant users and public purchase/enrollment actions, while preserving historical records for authorized platform operations.

- Branch deactivation prevents new branch-scoped operations but retains historic enrollments, attendance and certificates.

## Acceptance criteria

- **AC:** Duplicate tenant slug is rejected with a field-level error.

- **AC:** A tenant admin cannot create or update a branch belonging to another tenant.

- **AC:** Branch code uniqueness is enforced within the tenant, not globally unless product explicitly chooses global uniqueness.

- **AC:** Changing a tenant's display name does not alter immutable IDs or historical certificate evidence.

- **AC:** Suspension takes effect on the next authorized request/session refresh and is logged with actor, reason and timestamp.

- **AC:** Tenant list, branch list and dashboards only show records visible to the current role and scope.

# 5. Users, groups, invitations and roles

Purpose: manage identity, membership, team targeting and least-privilege access.

## Functional requirements

- Support user lifecycle: invite, accept, activate, deactivate and reactivate; avoid deleting users with learning history.

- Invitation includes tenant, optional branch/group, intended role, expiry, inviter and single-use token hash.

- Users may belong to multiple tenants; tenant membership is separate from the global user identity.

- Groups support name, description, optional branch/department scope and active status; group membership can be maintained manually for MVP.

- Permissions are explicit actions (e.g. course.read, course.publish, enrollment.assign, report.export) with tenant/branch/resource scope.

- Role assignments can be tenant-wide or branch-scoped; deny by default when no permission applies.

- Bulk user import should validate the entire file, show row-level errors and offer a downloadable error report before final commit.

## Acceptance criteria

- **AC:** Invitation link can be accepted once, expires at configured expiry and cannot be used for a different tenant or email.

- **AC:** Existing account accepting an invitation gains only the specified membership and role; existing memberships are not overwritten.

- **AC:** Unauthorized users cannot elevate their own role, assign platform roles or expand branch scope.

- **AC:** Deactivating a user blocks new sessions and invalidates active sessions/tokens within the defined revocation window.

- **AC:** Removing a user from a group recalculates future assignment targeting but does not erase completed history.

- **AC:** Role/permission changes and membership changes are audit logged.

- **AC:** Import preview reports valid, invalid and duplicate rows; committing does not create duplicate memberships on retry.

# 6. Course catalog and content authoring

Purpose: author, version, publish and discover tenant-controlled training.

## Functional requirements

- Catalog supports search, category filters, status, duration, delivery type, language, tags and eligibility.

- Course metadata includes title, summary, description, thumbnail, owner, category, estimated duration, delivery mode, visibility, optional price and completion policy.

- Course builder supports ordered modules and lessons with supported content types agreed for MVP: text/HTML, video, PDF/document, link and quiz/assessment.

- Assets are stored through StorageService; API returns short-lived authorized/signed access URLs where appropriate.

- Course states: Draft, Published, Archived. Published versions are immutable; edits create a new draft/version.

- Publishing validates required metadata, at least one valid learning item, access/visibility settings and completion rules.

- Tenant catalog may be private, tenant-authenticated or public; public catalog never exposes internal-only courses.

## Acceptance criteria

- **AC:** A draft is visible only to authorized content managers and is not assignable/purchasable unless an explicit preview mode is used.

- **AC:** Publishing creates a stable version number and records publisher/time.

- **AC:** Learners already enrolled in a published version retain that version unless an authorized migration policy explicitly moves them.

- **AC:** Reordering modules/lessons persists and is reflected in learner player order.

- **AC:** Unsupported or corrupted assets show a recoverable error and do not mark the lesson complete.

- **AC:** Course search and filters return only catalog items the user is entitled to see.

- **AC:** Archiving a course blocks new enrollment but preserves progress, assessments and certificates tied to previous versions.

# 7. Assignments and enrollments

Purpose: assign required training and manage self-enrollment or paid enrollment.

## Functional requirements

- Assignment targets include individual users, groups and eligible branch cohorts; store creator, assigned date, due date, priority, requirement type and optional reminder policy.

- Assignment rules define whether completion is mandatory, whether a due date applies, and whether the learner can self-enroll.

- Enrollment records learner, course version, source (assignment/self-enrollment/paid/classroom), status, assigned/enrolled date, due date and completion date.

- Statuses include Not Started, In Progress, Completed, Overdue, Cancelled and optionally Failed/Expired where business rules require them.

- Assignment fan-out must be idempotent; repeating a job or retry must not create duplicate active enrollments.

- Reassignment, cancellation and due-date changes preserve the event history.

## Acceptance criteria

- **AC:** Creating an assignment validates that all targets belong to the tenant and are within the actor's scope.

- **AC:** An assignment to a group creates enrollments for eligible current members and applies the documented policy for later-added members.

- **AC:** The system prevents duplicate active enrollment for the same learner/course version/source rule, or handles it using an explicitly defined reuse policy.

- **AC:** A due date in the past is either rejected or requires explicit confirmation; behavior is consistent and tested.

- **AC:** Learners see assigned, in-progress, completed and overdue learning in separate filters.

- **AC:** Cancellation prevents future progress actions where policy requires it but does not delete prior learning evidence.

- **AC:** Admin can inspect why an enrollment exists: assignment, self-enrollment, purchase or classroom session.

# 8. Learner dashboard and learning player

Purpose: provide a clear, accessible path from assigned learning to completion.

## Functional requirements

- Dashboard sections include Assigned, In Progress, Completed, Upcoming/Instructor-led and Available learning, plus due/overdue indicators.

- Course detail displays description, duration, delivery type, learning outcomes, eligibility, price if applicable, certificate availability and prerequisites.

- Player supports lesson navigation, resume position where supported, completion indicators, accessible media controls and next/previous navigation.

- Progress is saved server-side at meaningful checkpoints; video playback progress uses provider events or periodic progress updates with throttling.

- Learners can resume a course on another supported device after authentication.

- Public tenant landing/catalog can be branded but must not leak private learner data.

## Acceptance criteria

- **AC:** Learner only sees own enrollment and progress unless separately authorized as an instructor/manager.

- **AC:** Opening a lesson does not automatically mark it complete unless that content type's completion rule explicitly says so.

- **AC:** Progress survives refresh, logout/login and device change.

- **AC:** Player displays a recoverable message when media or assets cannot load and does not falsely mark completion.

- **AC:** Keyboard navigation, visible focus, meaningful labels and text alternatives are provided for primary learning controls.

- **AC:** The UI accurately distinguishes course completion from assessment pass and certificate issuance.

# 9. Assessments and progress tracking

Purpose: evaluate learning and retain reliable progress evidence.

## Functional requirements

- Assessment builder supports question bank, question types selected for MVP (multiple choice, multiple select and true/false at minimum), answer key, points, pass mark, attempt limit and optional time limit.

- Assessment versions are frozen once attempts exist; editing creates a new version.

- Attempts record learner, assessment version, start/submission time, answers, score, pass/fail, attempt number and grading status.

- Server validates question IDs/options and calculates objective scores; client-submitted score is never trusted.

- Course completion policy may require all mandatory lessons, a passing assessment, attendance or a combination.

- Progress events record lesson started/completed, assessment started/submitted, course completed and certificate awarded.

## Acceptance criteria

- **AC:** A learner cannot submit answers for an assessment version they are not entitled to access.

- **AC:** Attempt limit and time limit are enforced server-side, including concurrent tabs/retries.

- **AC:** A retry creates a new attempt; it does not overwrite prior results.

- **AC:** Score and pass/fail are calculated consistently using the configured pass threshold and rounding policy.

- **AC:** Progress totals are derived from defined required items; optional lessons do not silently change completion percentage.

- **AC:** Duplicate completion events do not issue duplicate certificates or double-count analytics.

- **AC:** Authorized staff can review permitted attempt results, with answer-key visibility restricted by policy.

# 10. Completion certificates

Purpose: issue verifiable evidence of successful completion.

## Functional requirements

- Admin can manage certificate templates with tenant branding and supported placeholders: learner name, course title/version, completion date, issue date, certificate ID and optional validity/expiry.

- Certificate award is triggered only when the course completion policy is satisfied.

- Award stores immutable evidence references: learner, course/version, completion record, issue time, template/version and unique public verification identifier.

- Learner can view/download a PDF certificate; authorized staff can search issued certificates.

- Certificate can be revoked or superseded with reason and actor; historic record remains.

- Expiry and renewal fields are available for compliance certificates where configured.

## Acceptance criteria

- **AC:** A certificate is not issued when required assessment/attendance/lesson conditions are unmet.

- **AC:** Repeated completion events produce one award per defined course/version/renewal cycle.

- **AC:** Downloaded PDF contains the correct learner, course, dates, tenant branding and unique certificate identifier.

- **AC:** Public verification endpoint reveals only minimal certificate verification data and does not expose private profile information.

- **AC:** Revoked certificates display as revoked on verification and cannot be presented as valid.

- **AC:** Certificate re-generation after template changes does not silently alter the original issued artifact unless an explicit reissue action is taken.

# 11. Basic compliance and progress reports

Purpose: show required training status and provide auditable operational evidence.

## Functional requirements

- Training requirement defines course/course version policy, applicability by tenant/branch/group/job role, due rule, renewal/validity period and effective dates.

- Compliance statuses include Compliant, Due Soon, Overdue, Not Started and Not Applicable; definitions and thresholds are configurable or documented.

- Basic reports include learner progress, course completion, overdue assignments, compliance status, expiring certificates and branch comparison.

- Filters include date range, branch, department/group, course, status and learner where permission allows.

- Exports support CSV initially; PDF exports may be added if needed. Exports are generated asynchronously for large datasets.

- Every report displays its scope, filters, generated-at time and timezone.

## Acceptance criteria

- **AC:** Compliance calculations use explicit due/expiry rules and are covered by boundary-date tests.

- **AC:** A learner completing a requirement updates status according to the policy without deleting earlier evidence.

- **AC:** Branch admin cannot export another branch's data unless explicitly granted cross-branch permission.

- **AC:** Report totals reconcile with the underlying filtered enrollment/compliance records.

- **AC:** CSV export applies the same filters and authorization as the on-screen report and protects against spreadsheet formula injection.

- **AC:** Large report generation does not block API requests; failed exports can be retried and failure is visible to the requester.

# 12. Surveys and feedback

Purpose: collect learner feedback and measure training quality.

## Functional requirements

- Survey builder supports title, description, questions, required/optional flags, open/close dates, audience and response visibility settings.

- MVP question types: single choice, multiple choice, rating scale and free text.

- Survey can be attached to a course completion, classroom session or targeted audience.

- Survey versions are frozen after responses begin; changes create a new version.

- Admin views response rates and aggregated results; free-text visibility follows configured permissions and anonymity policy.

- Learner sees surveys assigned to them and can save/submit according to the defined policy.

## Acceptance criteria

- **AC:** A learner cannot submit responses outside the survey's audience, open period or tenant scope.

- **AC:** Required questions are validated server-side.

- **AC:** Duplicate submissions are prevented unless the survey explicitly permits multiple responses.

- **AC:** Anonymous surveys do not store a direct user identifier in the response payload; operational metadata must not defeat the promised anonymity.

- **AC:** Admin sees response count and response rate based on the eligible audience definition.

- **AC:** Closing or archiving a survey preserves submitted responses and reporting history.

# 13. Classroom and instructor-led sessions

Purpose: schedule live training and connect attendance to learning records.

## Functional requirements

- Instructor can create a session from a course or course version with start/end, timezone, branch/venue or meeting link, capacity, instructor(s), registration window and cancellation policy.

- Learners can view eligible sessions, register/cancel within policy and see confirmed/waitlisted status if waitlisting is enabled.

- Instructor roster supports present, absent, late and excused attendance with timestamp and actor.

- Session changes and cancellations notify affected users through the configured notification channel when available.

- Attendance completion rules are explicit: attendance alone may complete a course or may be one component of a broader completion policy.

- Session records link to the course and the resulting enrollment/compliance evidence.

## Acceptance criteria

- **AC:** End time must be after start time; capacity cannot be negative; instructor must have valid access.

- **AC:** Registration cannot exceed capacity unless waitlist behavior is explicitly enabled.

- **AC:** Only authorized instructors/admins can change attendance; changes are audit logged.

- **AC:** A cancelled session cannot be marked completed without an explicit recovery/reopen workflow.

- **AC:** Attendance affects course completion only when the course policy says it should.

- **AC:** Session time is displayed in the correct configured timezone and stored consistently in UTC.

# 14. Commerce and paid enrollment

Purpose: allow tenants to offer paid courses without coupling payment-provider state to learning state.

## Functional requirements

- Tenant admin can configure paid offers/prices, currency, tax display rules and whether the course is public or authenticated-only.

- Checkout creates an order and order lines before redirecting to a payment provider; provider secrets remain server-side.

- Payment lifecycle is modeled separately: pending, authorized/processing where supported, paid, failed, cancelled, refunded and partially refunded if provider supports it.

- Only verified payment confirmation grants paid enrollment entitlement; browser redirect success is not sufficient.

- Payment webhooks are signature-verified, deduplicated and safe to retry.

- Refunds update order/payment state and apply the documented enrollment-access policy; historical learning evidence is retained.

- Admin can search orders and reconcile provider transaction IDs, amount, currency and state.

## Acceptance criteria

- **AC:** Changing the client return URL or submitting a fake success payload cannot grant enrollment.

- **AC:** Duplicate webhook delivery does not create duplicate orders, charges or enrollments.

- **AC:** Order amount and currency are calculated server-side from the active price/offer.

- **AC:** The system never stores raw card number or CVV; payment collection is delegated to the provider's secure checkout.

- **AC:** A paid order grants the correct tenant/course/version entitlement to the correct user.

- **AC:** Refund and charge failure behavior is visible to learner/admin and is audit logged.

- **AC:** Tax, invoice, cancellation, refund and consumer-law rules are validated for target markets before production; this specification does not prescribe legal treatment.

# 15. Advanced analytics and custom reporting

Purpose: provide useful operational insight without weakening authorization or overbuilding a data warehouse for MVP.

## Functional requirements

- Standard analytics include tenant/branch adoption, active learners, enrollment funnel, starts, completion rate, assessment pass rate, overdue compliance, certificate expiry and classroom attendance.

- Metrics have documented definitions, numerator/denominator, time window, timezone, excluded statuses and refresh expectations.

- Custom report builder MVP uses a governed list of approved dimensions, metrics, filters, group-by fields and date ranges; no arbitrary SQL entry.

- Users can save reports, rename/duplicate them, rerun them and export CSV subject to role scope.

- Dashboard drill-down links to the filtered source records where the user has access.

- Expensive reports use background jobs and bounded date ranges/row limits; caching or pre-aggregation is introduced only when measured load requires it.

## Acceptance criteria

- **AC:** A metric shown on a dashboard matches the equivalent filtered report within the documented refresh window.

- **AC:** All analytics queries enforce tenant/branch scope, including saved reports and export jobs.

- **AC:** A saved report cannot be shared with a user who lacks access to its underlying dimensions or records.

- **AC:** Invalid filters, unsupported combinations and excessive date ranges return understandable validation errors.

- **AC:** Export output contains the same filtered data as the report and records requester, scope and generation time.

- **AC:** Metric definitions are version-controlled or documented; changes that alter historical interpretation are communicated.

# 16. Cross-cutting UX and accessibility requirements

- **AC:** Every list page provides loading, empty, error and permission-denied states; empty states explain the next action where appropriate.

- **AC:** Destructive or irreversible actions require confirmation and show the scope of impact.

- **AC:** Forms validate required fields on the client for usability and on the server for correctness.

- **AC:** Pagination, sorting and filtering are consistent across admin tables; API limits are enforced server-side.

- **AC:** Primary workflows are keyboard-operable, have visible focus and correctly labelled form controls.

- **AC:** Status labels use text as well as color; charts include accessible summaries or tabular equivalents.

- **AC:** Responsive layouts work on mobile browser widths; the core learner journey does not require desktop-only interactions.

- **AC:** User-facing date/time displays use the selected timezone and locale; monetary values show currency.

# 17. API conventions and representative contracts

- Prefix routes with /api/v1; use JSON request/response bodies and consistent pagination metadata.

- Use a standard error envelope: code, message, requestId, fieldErrors (when applicable); never expose stack traces in production.

- Use 401 for unauthenticated, 403 for authenticated-but-not-authorized, 404 where record existence should not be disclosed, 409 for state conflicts, and 422 for validation failures.

- Use idempotency keys for create-order, payment webhook handling, assignment fan-out and certificate-award jobs.

- List endpoints accept cursor or page pagination, bounded page size, allowlisted sort fields and validated filters.

- Write operations use optimistic concurrency/version checks where simultaneous editing could lose changes.

| **Method / route**                                           | **Purpose**              | **Key validation**                                                       |
|--------------------------------------------------------------|--------------------------|--------------------------------------------------------------------------|
| POST /api/v1/tenants                                         | Create tenant            | Platform admin only; unique slug; required fields.                       |
| POST /api/v1/tenants/{tenantId}/branches                     | Create branch            | Tenant scope; branch code uniqueness.                                    |
| POST /api/v1/invitations                                     | Invite user              | Actor may invite; role and branch scope cannot exceed actor's authority. |
| POST /api/v1/courses                                         | Create course draft      | Tenant scope; valid metadata.                                            |
| POST /api/v1/courses/{courseId}/versions/{versionId}/publish | Publish version          | Publisher permission; required content and policy validation.            |
| POST /api/v1/assignments                                     | Create assignment        | Targets authorized; due date and course version valid; idempotency.      |
| POST /api/v1/enrollments/{id}/progress                       | Record progress          | Enrollment belongs to user/scope; event valid; rate limit/throttle.      |
| POST /api/v1/assessments/{id}/attempts                       | Start assessment attempt | Eligible enrollment; version available; attempt limit.                   |
| POST /api/v1/attempts/{id}/submit                            | Submit attempt           | Attempt belongs to learner; deadline and submission state valid.         |
| GET /api/v1/certificates/{id}/verify                         | Public verification      | Opaque identifier; minimal response; revocation/expiry status.           |
| POST /api/v1/sessions/{id}/attendance                        | Record attendance        | Instructor/admin permission; valid roster state.                         |
| POST /api/v1/checkout/orders                                 | Create checkout order    | Active offer; server-calculated amount/currency; idempotency.            |
| POST /api/v1/webhooks/payments/{provider}                    | Process payment event    | Verify signature; deduplicate provider event ID.                         |
| POST /api/v1/reports/{reportId}/exports                      | Generate export          | Permission and filters validated; async job for large exports.           |

# 18. Notifications, audit and background jobs

## Notifications

- Minimum event candidates: invitation, assignment created, due-soon reminder, overdue reminder, enrollment confirmation, session change, certificate issued/expiring, payment result and survey request.

- Email provider and messaging provider are adapters; failure to deliver a notification must not roll back a valid learning transaction.

- Store delivery state and retry transient failures with bounded backoff; avoid duplicate sends on job retries.

## Audit events

- Record actor, tenant, optional branch, action, entity type/ID, timestamp, request/correlation ID and safe before/after fields where appropriate.

- Audit at minimum: tenant/branch lifecycle, invitations/memberships/roles, course publish/archive, assignment changes, assessment grading overrides, certificate issue/revoke, attendance edits, orders/refunds and report exports.

- Audit records are append-only to application users; restrict access and retention by policy.

## Background job rules

- **AC:** Every job has a unique business key or idempotency strategy.

- **AC:** Retries do not duplicate enrollments, certificates, payment effects or notifications.

- **AC:** Job status includes queued, running, succeeded, failed and retrying, with sanitized error details.

- **AC:** Long-running exports, bulk imports, certificate PDFs and notification batches do not block normal API request threads.

# 19. Security, privacy and non-functional requirements

| **Area**         | **MVP acceptance target**                                                                                                                                                              |
|------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Authorization    | All API routes enforce server-side permission and scope checks; no reliance on hidden UI controls.                                                                                     |
| Tenant isolation | Automated negative tests cover tenant, branch, report, asset, certificate and commerce cross-scope attempts.                                                                           |
| Authentication   | Secure password/session implementation or supported identity provider; email verification and password reset; session revocation on deactivation.                                      |
| Secrets          | Secrets stored in environment/secret manager; never committed to source control or returned to client.                                                                                 |
| Uploads          | Validate type/size; generate non-guessable object keys; scan where available; never trust filename or content-type alone.                                                              |
| Webhooks         | Signature validation, replay protection where supported, deduplication and safe retry.                                                                                                 |
| Performance      | Agree numeric targets before production load testing; initial baseline: common list/detail APIs p95 under 500 ms at expected MVP load, excluding external providers and heavy reports. |
| Reliability      | Health/readiness endpoints, error monitoring, structured logs, automated database backups and a tested restore procedure.                                                              |
| Accessibility    | Target WCAG 2.2 AA for primary learner and administrator flows; document any exceptions.                                                                                               |
| Browser support  | Current stable Chrome, Edge, Firefox and Safari; responsive browser-based learner access.                                                                                              |
| Data integrity   | Foreign keys, unique constraints, transactions and migration checks for critical learning, payment and certificate records.                                                            |
| Privacy          | Minimize collected personal data; define retention/export/deletion policies; do not erase legally/operationally required learning evidence without an approved policy.                 |

The performance number above is a proposed initial engineering target, not a measured result. Confirm it against expected concurrent users, course media behavior, database size and hosting budget.

# 20. Testing strategy and mandatory scenarios

| **Test layer** | **Minimum coverage**                                                                                                                                           |
|----------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Unit           | Permission evaluation, due-date rules, completion policy, scoring, compliance status, certificate eligibility, order state transitions and metric definitions. |
| Integration    | Database constraints, tenant scoping, storage adapter, email adapter, payment webhook verification, report query filters and job idempotency.                  |
| API            | Validation/error envelopes, pagination, status transitions, authorization and concurrency conflicts.                                                           |
| End-to-end     | Admin creates tenant/branch/users/course; assigns learning; learner completes lessons and assessment; certificate issues; report reflects completion.          |
| Security       | Cross-tenant/branch IDOR, privilege escalation, invitation replay, unsafe upload, webhook spoof/replay, export leakage and formula injection.                  |
| Migration      | Counts, relationships, tenant ownership, progress totals, assessment attempts, certificate evidence, duplicate detection and sampled record reconciliation.    |
| Resilience     | Provider timeout, duplicate webhook, job retry, email outage, failed export, interrupted upload and database restore.                                          |
| Accessibility  | Keyboard-only critical journey, screen-reader labels, focus order, color contrast and form error announcements.                                                |

## 20.1 Required end-to-end scenarios

1.  Create Tenant A and Tenant B; create branches in both; prove all cross-tenant read/write attempts fail.

2.  Invite a learner to Tenant A and Branch A1; accept once; attempt replay and branch escalation; both are rejected.

3.  Publish course version 1; enroll a learner; publish version 2; verify existing enrollment remains on version 1 unless migrated by explicit policy.

4.  Assign a course to a group; retry assignment creation; verify no duplicate active enrollments.

5.  Complete required lessons and pass the assessment; verify progress, completion, certificate and reports agree.

6.  Fail assessment; verify no certificate when passing is mandatory; retake and pass within attempt limits.

7.  Create a compliance requirement with due date and expiry; test due-soon, overdue, completion and renewal boundary dates.

8.  Create a classroom session; register learners; record attendance; verify the configured attendance completion policy.

9.  Purchase a paid course; deliver the same verified webhook twice; verify one paid entitlement and one order transition.

10. Issue refund; verify payment/order state and enrollment access follow configured policy while historical evidence remains.

11. Submit a survey; verify eligibility, required fields, anonymity behavior and aggregate response count.

12. Run a branch-scoped custom report and export; verify both exclude other branches and match the on-screen filters.

# 21. Definition of Done and release gates

- **AC:** All requirements marked Must for the release have acceptance tests and pass in CI or documented QA.

- **AC:** No unresolved critical/high severity tenant isolation, privilege escalation, payment integrity or certificate integrity defect remains.

- **AC:** Database migrations are versioned, repeatable in a clean environment and tested against a representative data set.

- **AC:** Staging environment uses production-like configuration with separate secrets and a documented rollback path.

- **AC:** Backup and restore procedure has been executed successfully in a non-production environment.

- **AC:** Critical workflows have structured logs, request IDs, error monitoring and actionable alerts.

- **AC:** Accessibility and responsive checks cover the primary administrator and learner journeys.

- **AC:** API documentation, environment setup, seed data, support runbook and known limitations are updated.

- **AC:** Product owner signs off on unresolved business policy choices, especially group assignment behavior, completion rules, compliance thresholds, refunds and survey anonymity.

# 22. Product decisions to confirm before implementation

| **Decision**                    | **Recommended MVP default**                                                                                                       | **Why it must be explicit**                                     |
|---------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------|
| Group assignment behavior       | New members receive active group assignments; removed members keep historical enrollment, with future access policy configurable. | Avoids inconsistent outcomes when groups change.                |
| Course version migration        | Existing enrollments stay on their enrolled version unless an admin explicitly migrates them.                                     | Preserves reproducible completion evidence.                     |
| Completion policy               | Per-course configurable rules; mandatory lessons + required passing assessment; attendance only when specified.                   | Different training types have different evidence requirements.  |
| Compliance due/expiry           | Requirement-level due rule and renewal interval; store dates and policy version on evidence.                                      | Needed for auditability and boundary tests.                     |
| Refund access                   | Admin-configurable policy; preserve learning evidence even if access is revoked.                                                  | Payment state and learning history are different concerns.      |
| Public certificate verification | Opaque verification ID; show validity, course, issue date and issuer only.                                                        | Balances trust and privacy.                                     |
| Survey anonymity                | Explicit anonymous vs identified mode; no silent mode changes after launch.                                                       | Anonymity promises must be technically meaningful.              |
| Payment provider/market         | Select provider and target countries before commerce production release.                                                          | Tax, refund, currency and invoice obligations vary.             |
| Content formats                 | Confirm video, PDF, text, link and quiz for first release; treat SCORM/xAPI as separate validated scope.                          | Legacy screens do not prove supported content package behavior. |
| Analytics definitions           | Publish a metric dictionary before dashboard implementation.                                                                      | Prevents conflicting completion/compliance percentages.         |

# 23. Legacy migration and validation notes

- Map legacy tenant/portal concepts to the new Tenant and optional TenantDomain/Portal configuration only after confirming whether they represent the same business boundary.

- Map legacy users, roles, groups and mappings to explicit Membership, RoleAssignment and GroupMember records; do not carry forward generic JSON access fields as the authorization model.

- Map legacy catalog/course details to Course and CourseVersion; retain historical identifiers in migration metadata for traceability.

- Map learner progress, assessment attempts and certificate data only after reconciling status semantics, timestamps and completion calculations.

- Preserve audit history where available and record source system, source table/key, import batch and migration outcome.

- Do not silently discard custom0–custom4 fields or legacy modules; profile usage, map meaningful fields, and retire only with product-owner approval.

- Create exception reports for orphaned users, duplicate memberships, invalid tenant/portal references, inconsistent completion statuses and certificates without evidence.

- Perform a dry-run import, reconcile counts and sample records with business owners, then obtain sign-off before cutover.

# 24. Suggested delivery order

| **Sprint/phase**           | **Engineering focus**                                                                                                          | **Demonstrable outcome**                                                |
|----------------------------|--------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|
| 0 — Discovery              | Screen/workflow inventory, legacy data profiling, business-rule decisions, content/media inventory, payment/provider decision. | Approved scope, decision log and migration mapping.                     |
| 1 — Platform foundation    | Auth, tenant/branch, memberships, roles, audit, migrations, CI/CD, storage abstraction.                                        | Two-tenant isolation demonstration.                                     |
| 2 — Content & access       | Groups, invitations, course builder, assets, course versioning and catalog.                                                    | Tenant admin publishes a course; learner can discover eligible content. |
| 3 — Learning lifecycle     | Assignments, enrollments, player, progress, assessments, completion policy and certificates.                                   | End-to-end completion and certificate journey passes.                   |
| 4 — Operations             | Compliance requirements, basic reports/exports, surveys, classroom scheduling/attendance.                                      | Training operations can track online and instructor-led evidence.       |
| 5 — Commercial & analytics | Paid offers, checkout/webhooks/refunds, metric dictionary, saved reports and analytics.                                        | Payment reconciliation and scoped analytics pass acceptance tests.      |
| 6 — Production readiness   | Security review, load test, accessibility, restore test, migration rehearsal, support docs.                                    | Go/no-go checklist signed.                                              |

# Appendix A — Minimum acceptance checklist

- [ ] Tenant and branch ownership is enforced at every API and data access boundary.

- [ ] Role permissions are explicit and branch-scoped roles cannot cross branch boundaries.

- [ ] Invitations are single-use, expiring and scoped to intended tenant/email.

- [ ] Published course versions are immutable and enrollment version references are stable.

- [ ] Assignment creation and background fan-out are idempotent.

- [ ] Learner progress is server-owned and consistent across sessions/devices.

- [ ] Assessment score/pass/fail is calculated server-side and attempts are versioned.

- [ ] Certificate issue/revoke/verify flows preserve evidence and avoid duplicates.

- [ ] Compliance status and due/expiry calculations have boundary-date tests.

- [ ] Report filters, dashboards and exports share the same authorization and metric definitions.

- [ ] Survey visibility and anonymity behavior are tested against the selected policy.

- [ ] Classroom capacity, attendance changes and completion policy are enforced.

- [ ] Payment webhooks are verified, deduplicated and cannot grant access from a browser redirect alone.

- [ ] Custom reports use governed dimensions and metrics, not arbitrary SQL.

- [ ] Backups, restore, monitoring, error reporting and migration reconciliation are tested.
