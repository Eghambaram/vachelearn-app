# Legacy Capability Inventory

Extracted 2026-10-20 from `reference/legacy/001-AdminScreens.pdf` (43 pages, screenshots only),
`002-LearnnerScreens.pdf` (5 pages, screenshots only) and `003-Application ERD_merged.pdf` (26 pages, text-extractable).

**What this is:** evidence of what the previous system could do, to help scope VacheLearn and plan any migration.
**What this is not:** a requirement to copy it. The legacy product is a third-party LMS (**ExpertusOne**, hosted at
`lms5.expertusonesandbox.cloud`). Do not reuse its branding, layout, wording, icons or assets. Hidden business rules
are not proven by screenshots or column names — record anything you would rely on as a decision.

Legend for "VacheLearn plan": **MVP** = in R1–R2 · **R3/R4** = later release in MASTER_PROMPT · **Candidate** = not
scheduled; owner decides (D-043) · **Replace** = do it differently on purpose · **Drop** = do not carry forward.

## 1. Legacy information architecture (admin)

Admin home: Quick Access tiles (Organization, User, Learner Group, Content, E-Learning, Classroom), Other Links (Admin
Configuration, Branding, Reports, Metadata Library), dashboard widgets (Site visitors, Enrollments & completions,
Compliance/mandatory training, Most popular courses, Most popular training plans). Main menu: **Learning, Enrollments,
People, Survey, Assessment, Communication, Reports, Commerce, Site Admin, Metadata Library, Maintenance.**

Learner site: hero banner, My Learning (To complete / Completed), Catalog (rows: Most recent, Most popular, Most
viewed, Recommended), My Profile (photo, QR code, about, interests, work experience, education), course detail with
class list, Discussion and Ratings tabs, shopping cart + checkout with billing address. Public catalog with Log in /
Sign up / Forgot password and language selector.

## 2. Capability map

| Area | Legacy evidence (screens / ERD tables) | VacheLearn plan |
|---|---|---|
| Tenancy | `tenant` (url, region, storage quota, contact, vertical, edition, total_users), `portal` (per-tenant sites, `is_admin`/`is_learner`, own URL) | **MVP** Tenant + Branch; portal concept → D-030; storage quota → tenant usage (R4) |
| Feature modules | `modules`, `sub_modules`, `module_mapping`, editions, dependencies | **Replace** with per-tenant feature flags (D-031) |
| Branding & page builder | Admin/learner branding (logos, colours, footer), learner page builder, `page_builder_templates`, themes | **MVP** basic tenant branding (logo, colours); page builder **Candidate** |
| Site configuration | `admin_general_settings`, `learner_general_settings`, `variable_configuration` (label overrides), `site_code_generation` (ID prefixes) | **Replace** with typed `TenantSetting`; label overrides via i18n (Candidate) |
| Organizations | Organization hierarchy (child orgs, type internal/external, contact, cost center), change log | **MVP** Branch (+ Department); external organizations **Candidate** |
| Users | Card grid + filters (status, user type, roles, job role, department, manager, organization, country, state, hire date), create/edit with ~30 profile fields, bulk upload with template, external training record upload, per-record change log, `profile_audit_log` | **MVP** core profile + scoped list + audit; bulk import **R2/R3**; extended HR fields → decide; external training **Candidate** |
| User reference data | Departments, employment types, user types, job roles, job titles, cost centers (Metadata Library → People) | **MVP** Department; job role for compliance applicability; others **Candidate** |
| Groups | Learner groups and admin groups with rule-based inclusion/exclusion (`included_users`, `excluded_users`, `group_type`, `valid_till`, `parent_id`) | **MVP** manual groups; rule-based dynamic groups **Candidate** |
| Roles & access | `user_access_mapping` (generic JSON access), `roles_module_mapping` with privileges per module | **Replace** with explicit permissions + scoped RoleAssignment; do not migrate JSON access |
| Content library | Content master/versions (title, code, type, language, duration, file, version history "Transfer learners to other version"), document library, conversion status | **MVP** Asset + Lesson in CourseVersion; version transfer = explicit migration (D-011) |
| E-learning standards | `content_version.manifesturl/launchurl/lrs_config`, `lnr_aicc_interaction`, `launch_data`, mastery score | **Candidate** — SCORM/xAPI/AICC (D-012); not claimed |
| Courses (catalog) | Create/edit course tabs: **Details, Prerequisite, Equivalence, Skills, Survey/Assessment, E-Signature, CEU, Observation Checklist, Notification, Gamification**; side actions: Manager Approval, Business Rule, Files, Tags, Completion Certificate, Share, Access, Access Setting, Enrollment Statistics, Enrollments. Fields: title, language, delivery type, code, domains, category, provider, price + currency, seats max, contact support, total duration, registration end, compliance flag + complete-by days/date, post-completion status | **MVP** details, prerequisites, assessment, certificate, tags, enrollments; equivalence, skills, e-signature, CEU, observation checklist, gamification, manager approval **Candidate** |
| Training plans / programmes | `program_structure`, `program_module`, mandatory/optional completion counts, module-level completion rule, enforce sequence, expiration rule | **Candidate** learning paths (D-025) |
| Classroom | `course_session_master/details` (recurring sessions, days, times, delivery type, meeting type/id/password, presenter/attendee URLs, instructor/presenter/moderator), `location` + rooms + capacity + `equipment`, min/max/waitlist seats, registration end, cancel reason | **R3** sessions, venues, capacity, attendance; waitlist (D-019); VC integrations (Zoom/Teams) **Candidate**; equipment **Drop/Candidate** |
| Enrollments | `course_enrollment` (register status/type, completion status/date, progress, score, due_on, expired_on, mandatory, compliance, recertify path, exemption with reason, waitlist priority, cancel reason, version_no), `program_enrollment`, `enrollment_notes`, excluded users | **MVP** Enrollment with statuses + history; exemption → compliance Not Applicable (decide); recertification **R3** |
| Learning assignment | `learning_assignment` rules (criteria type, days after hire date, start/end), success/failed user logs | **MVP** Assignment; hire-date-relative rules **Candidate** |
| Assessments | Question groups/sections, question types, answer choices, random strategy, timer, attempts, pass %, review/view/test-out options, anonymous flag, pre-assessment | **MVP** core types + limits; randomisation, test-out, pre-assessment **Candidate** |
| Surveys | Questions, sections, random strategy, anonymous flag, "consider for completion", external QuestionPro responses | **R3** surveys; external survey tool **Drop** |
| Certificates | `certificate_templates`, `certificates`, `certificates_mapper`; external certificates with verification status | **MVP** templates + awards + verification; external certificate verification **Candidate** |
| Compliance | `catalog_compliance` (complete days/date, validity days/date, exceeds-deadline status), `cmpl_expired`, recertify path, dashboard "Compliance training" | **R3** TrainingRequirement + status engine (D-018) |
| Skills & CEU | `skill`, `skill_mapping`, proficiency models/levels, `ceu_provider`, `ceu_type`, `ceu_entity_mapping` | **Candidate** |
| Engagement | Points/badges (`activity_points`, `user_points`), ratings + review summaries, wishlist, playlist, bookmarks, archive, discussions, "items need attention" alerts, meet/flash requests | **Candidate** (gamification, ratings) / **Drop** (playlist, flash) — reference images also show Achievements |
| Communication | Notification templates (subject, body, footer, CC/BCC, notify before, frequency, iCal), notification overrides per course, keywords/placeholders | **R3** notifications with minimal tenant templates |
| Commerce | Cart, orders, order items, billing address, payment methods, payment logs, discounts + discount codes, tax settings (nexus, VAT), currencies + conversion, drop/refund policy with refund %, approvals | **R4** offers, orders, hosted checkout, refunds (D-007, D-008, D-029); discounts **Candidate**; multi-currency conversion **Candidate** |
| Reports | Report dashboard "Quick reports" by area (enrollment, catalog, certificate, users, compliance, survey, assessment, learning plan, e-signature, purchasing, training…), assessment results, question-level summary, course listing report with saved filters + schedule | **MVP** basic reports; **R3** compliance + exports; **R4** governed builder + saved reports; scheduled delivery **Candidate** |
| Metadata library | Learning (categories A–Z, providers, CEU providers/types, tags), People, E-commerce, General (languages, countries, states, currencies, timezones) | **MVP** categories + tags; reference data seeded (countries, timezones, currencies) |
| Custom fields | `custom_field_list/options/mapping` per entity with datatype, validation, mandatory, unique | **Candidate** typed custom fields; never generic `custom0..4` |
| Data loads & jobs | `cron_master/log/details`, `dataload_*` (bulk imports with batches, failure records), Maintenance menu | **Replace** with job/outbox table + import preview (R2/R3) |
| Audit | `general_audit_log`, `people_audit_log`, `manage_audit_log`, `configuration_audit_log`, `profile_audit_log`, `lnr_general_audit_log`, per-record change logs in UI | **MVP** single append-only `AuditEvent` with consistent shape |
| Sessions & login | `login_details` with logged in/out, last seen, **impersonated_logged_in + impersonated_reason** | **MVP** sessions; impersonation **Replace** with audited support access (D-037) |
| Learner profile | About me, interests, awards, education, work experience, skills, QR code | **Candidate**; MVP = basic profile + notification preferences |
| Integrations | `lnr_api`, API endpoints/mapping with auth scope, `external_catalog_log`, `salesforce_org_id` | **Candidate** public API + integrations after R2 |

## 3. Legacy data-model anti-patterns (do not carry forward)

- `custom0`–`custom4` text columns on most tables and generic `access` JSON for authorization.
- `users_profile` repeated as a wide, denormalised table on many ERD pages, including a `password` column — never
  migrate legacy passwords without a security review; prefer forced reset (see prompts/phase-7 §7.5).
- `tinyint status` and `status_name` strings instead of enums with timestamps.
- `bigint` sequential IDs exposed in URLs (VacheLearn uses UUIDs + opaque public IDs).
- Duplicate concepts (`catalog` vs `catalog_details` vs `content_master`) — VacheLearn has Course → CourseVersion →
  Module → Lesson → Asset.

## 4. Glossary (legacy term → VacheLearn term)

| Legacy | VacheLearn |
|---|---|
| Tenant / Portal / Site | Tenant (+ TenantDomain/branding; portal question D-030) |
| Organization | Branch / Department (external orgs: candidate) |
| Learner group / Admin group | Group (targeting) / RoleAssignment (admin rights) |
| Catalog, Course, E-Learning, Classroom (delivery types) | Course with delivery mode online / classroom / blended |
| Content (master/version) | Asset + Lesson inside CourseVersion |
| Training plan (TP) / Program | Learning path (candidate, D-025) |
| Class / Session | ClassSession |
| Registration / Enrollment | Enrollment |
| Learning assignment | Assignment |
| Compliance / Recertify | TrainingRequirement / renewal cycle |
| Metadata library | Categories, tags, reference data |
| Communication | Notifications |
| Site Admin / Admin configuration | Tenant settings / Platform settings |
