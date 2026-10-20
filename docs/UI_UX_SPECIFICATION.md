# VacheLearn UI/UX Specification

## Design direction
Premium, accessible enterprise SaaS. Use a neutral light workspace, deep green/teal primary actions, restrained amber for warnings/highlights, clear typography, consistent spacing, rounded cards and subtle borders/shadows. Dark green navigation may be used for admin/learner portals. Use industrial photography sparingly and only when it improves comprehension.

The supplied images are concept references. They do not establish final copy, actual metrics, data contracts or business rules. Replace sample metrics with real API data once available; label demo data clearly in prototypes.

## Design tokens (Proposed — sampled from `assets/brand/vache-logo.jpg` and `assets/ui-ux/01-…-final.png`)

Contrast ratios below were computed (WCAG 2.x formula) when this kit was prepared. Re-verify in Phase 1 Slice 1.2
after any change and record final values here.

| Token | Value | Use | Contrast check |
|---|---|---|---|
| `--color-primary` | `#0F6E56` | Primary buttons, links, active nav, focus ring | white text 6.20:1 ✅ · on bg 5.90:1 ✅ |
| `--color-primary-hover` | `#075743` | Hover/pressed primary | white text 8.56:1 ✅ |
| `--color-brand` | `#1D9F73` | Logo green, charts, progress fills, large accents | white text 3.36:1 — **large text/icons only**, never body text ⚠️ |
| `--color-accent` | `#ED9E27` | Highlights, warning accents, chart series | 2.21:1 on white — **never as text on white**; use dark text on amber (7.89:1) ⚠️ |
| `--color-sidebar` | `#062A22` | Authenticated workspace sidebar | white 15.42:1 ✅ · muted `#A7C4BB` 8.26:1 ✅ |
| `--color-bg` | `#F6FAFB` | App background | ink `#111827` 16.88:1 ✅ |
| `--color-surface` | `#FFFFFF` | Cards, tables, dialogs | — |
| `--color-text` | `#111827` | Body text | ✅ |
| `--color-text-muted` | `#5B6475` | Secondary text | 5.96:1 on white ✅ |
| `--color-border` | `#D0D5DD` | Decorative dividers only | 1.47:1 — not for input boundaries |
| `--color-border-input` | `#7A8394` | Form control boundaries (WCAG 1.4.11 needs ≥ 3:1) | 3.82:1 ✅ (`#98A2B3` fails at 2.58:1) |
| `--color-success-700/50` | `#067647` / `#ECFDF3` | Published, Active, Compliant, Completed badges | 5.40:1 ✅ |
| `--color-warning-700/50` | `#8A5A00` / `#FFF4E0` | Due Soon, Under Review, Trial | 5.44:1 ✅ |
| `--color-danger-700/50` | `#B42318` / `#FEF3F2` | Overdue, Suspended, Failed, Revoked | 6.05:1 ✅ |
| `--color-info-700/50` | `#175CD3` / `#EFF8FF` | In Progress | 5.57:1 ✅ |
| Neutral badge | `#344054` on `#F2F4F7` | Draft, Not Started, Archived, Cancelled | verify in Phase 1 |

Typography: one sans-serif family, self-hosted (Inter or similar — record choice in DECISIONS), scale 12/14/16/18/
20/24/30/36, body 14–16 px, tabular numerals for tables and KPIs. Radius 8 px (controls) / 12 px (cards). Spacing on
a 4 px grid. Shadows subtle (cards: 0 1px 2px rgb(16 24 40 / 6%)). Icons: one outline set (e.g. Lucide).

## Status vocabulary (use these exact labels everywhere)

| Entity | Statuses |
|---|---|
| Tenant | Active · Suspended · Archived (· Trial only if subscriptions D-027) |
| Course / version | Draft · (Under Review if D-022) · Published · Archived |
| Enrollment | Not Started · In Progress · Completed · Overdue · Cancelled (· Failed / Expired only if a rule needs them) |
| Attempt | In Progress · Submitted · Passed · Failed |
| Certificate | Valid · Expired · Revoked · Superseded |
| Compliance | Compliant · Due Soon · Overdue · Not Started · Not Applicable |
| Attendance | Present · Absent · Late · Excused |
| Order | Pending · Paid · Failed · Cancelled · Refunded · Partially Refunded |
| Job / export | Queued · Running · Succeeded · Failed · Retrying |

## Reference image caveats

- The images were generated as concept art. All names, numbers, ₹ revenue, ratings and dates in them are fictional.
- `10-public-landing-page-reference.png` shows real third-party company logos in a "Trusted by" strip and a customer
  quote. **Do not reproduce either.** Use placeholders until the owner provides permitted logos and real quotes.
- Learner/player images show Achievements, Messages, Calendar, Notes, Discussion, Announcements, ratings and a
  "Quick Quiz". These are out of MVP scope (see MASTER_PROMPT §3.2). Omit them rather than ship inert UI.
- Platform dashboard revenue/plan widgets appear only if tenant subscription billing (D-027) is Confirmed.

## Core layout system
- Left navigation for authenticated workspaces.
- Top bar with global search where appropriate, notifications, help, locale and user menu.
- Consistent page title, subtitle and primary action.
- Filterable/paginated tables with explicit empty/loading/error states.
- Cards for key summaries, with accessible labels and chart/table equivalents.
- Confirmation dialogs for destructive actions.
- Responsive layouts; learner flow must work on mobile.
- WCAG 2.2 AA target for primary flows.

## Screen inventory

### Public and tenant website
1. VacheLearn marketing landing page.
2. Tenant-branded public catalog.
3. Course catalog search and filters.
4. Course detail and enrollment.
5. Login, invitation acceptance, registration and password reset.
6. Checkout/payment result when commerce is enabled.

### Platform Admin
7. Platform dashboard.
8. Tenant list and filters.
9. Tenant create/detail/edit/suspend/reactivate.
10. Platform users and roles.
11. Global course/content library if platform-owned content is supported.
12. Integrations and system settings.
13. Audit logs.
14. Platform usage and subscription overview.

### Tenant Admin
15. Tenant dashboard.
16. Branch list/detail/create/edit.
17. Users and memberships.
18. Groups and membership.
19. Roles/permissions assignments.
20. Invitations.
21. Course management.
22. Course builder: metadata, content/modules, assessment, settings, pricing, preview/publish.
23. Assignments and enrollments.
24. Assessment builder, question bank and results.
25. Certificate templates and issued certificates.
26. Compliance requirements and status.
27. Surveys and results.
28. Classroom sessions and attendance.
29. Reports, filters and exports.
30. Branding and settings.

### Branch Admin/Learning Manager
31. Branch dashboard and scoped people.
32. Team/group learning progress.
33. Assignment creation and overdue follow-up.
34. Compliance dashboard and scoped reports.

### Instructor
35. Instructor dashboard.
36. Assigned courses and permitted content editing.
37. Session calendar, roster and attendance.
38. Assessment results and learner progress.

### Learner
39. Learner dashboard.
40. My Learning: assigned, in progress, completed, overdue, available.
41. Course detail and learning player.
42. Assessment taking and results.
43. Certificates and verification.
44. Classroom session discovery/registration.
45. Surveys and feedback.
46. Profile and notifications.

## Platform Admin Dashboard
- KPI row: tenant count/status, learners, published courses, completion rate, recurring revenue only when commerce/subscriptions are actually implemented.
- Analytics: tenant growth, enrollment trend, plan/revenue breakdown if real data exists.
- Tables: recent tenants, expiring subscriptions.
- Activity feed with actor and timestamp.
- Date range and filters.
- All displayed values must be computed from API/data, not hardcoded in production.

## Course Management & Builder
- Course list: search, category, level, format, instructor, status, sorting, pagination.
- Builder steps: Basic Information → Content Builder → Assessment → Settings → Publish.
- Metadata: title, description, thumbnail, category, level, delivery mode, duration, language, learning objectives, audience, prerequisites.
- Content builder: reorder modules/lessons, add supported lesson types, preview and save.
- Draft changes persist; publish validates metadata/content/policy and creates immutable version.
- Published version is never silently mutated.

## Learner Dashboard
- Summary of assigned, in progress, completed and overdue courses.
- Continue Learning cards with progress and resume action.
- Upcoming deadlines and sessions.
- Recently completed courses and certificates.
- Recommended courses only when eligibility and catalog policy permit.
- Announcements and achievements are optional modules and must not block core learning.

## Course Learning Player
- Left lesson/module navigation with completion indicators and durations.
- Main content player for video, text or documents.
- Course progress and due date.
- Tabs/areas for lesson notes, resources and discussion only if implemented.
- Previous/next lesson, save progress, mark complete and optional quick quiz.
- Right panel for notes/resources only if those features are supported.
- Never mark complete merely on lesson open unless explicit content policy permits it.
- Server owns progress and completion state.

## Screen implementation order
1. Design system and responsive shell.
2. Platform Admin dashboard.
3. Tenant Admin dashboard.
4. Course Management & Builder.
5. Learner Dashboard.
6. Course Learning Player.
7. Assessment.
8. Certificate.
9. Compliance and reports.
10. Classroom, commerce and advanced analytics.
