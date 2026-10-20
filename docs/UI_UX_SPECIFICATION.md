# VacheLearn UI/UX Specification

## Design direction
Premium, accessible enterprise SaaS. Use a neutral light workspace, deep green/teal primary actions, restrained amber for warnings/highlights, clear typography, consistent spacing, rounded cards and subtle borders/shadows. Dark green navigation may be used for admin/learner portals. Use industrial photography sparingly and only when it improves comprehension.

The supplied images are concept references. They do not establish final copy, actual metrics, data contracts or business rules. Replace sample metrics with real API data once available; label demo data clearly in prototypes.

## Design tokens (implemented in Phase 1 Slice 1.2, 2026-10-20)

**Source of truth:** `apps/web/src/styles/tokens.css`. Token names carry a `vl-` prefix (`--vl-color-primary`) so they
do not collide with Tailwind's own `--color-*` theme variables; `apps/web/src/app/globals.css` maps them onto
Tailwind/shadcn names (`bg-primary`, `text-muted-foreground`, `ring-ring`, …). Tailwind's default palette is removed,
so only token colours exist as utilities. Raw colour values anywhere else in `apps/web/src` fail the unit test
`no-raw-hex.test.ts`. The developer token sheet is at `/design` (dev only, see `ENABLE_DESIGN_GALLERY`).

Naming notes: the amber brand accent is `--vl-color-accent` but its utility is `highlight` (`bg-highlight`), because
shadcn/ui uses "accent" for a subtle hover surface. Status colours are `success|warning|danger|info` (700 text on 50
background) with utilities `text-success` / `bg-success-subtle` etc.

**Contrast.** Every pair the UI may use is declared in `apps/web/src/styles/tokens.ts` and checked by
`tokens.contrast.test.ts` (WCAG 2.2 formula). The table below is generated from those files; any token change that
breaks a minimum fails the build gates. 4.5:1 = normal text; 3:1 = large text, icons, focus indicators and control
boundaries (WCAG 1.4.3 / 1.4.11).

| Foreground on background                 | Values                | Ratio   | Minimum | Use                                      |
| ---------------------------------------- | --------------------- | ------- | ------- | ---------------------------------------- |
| `text` on `bg`                           | `#111827` / `#f6fafb` | 16.88:1 | 4.5     | Body text on app background              |
| `text` on `surface`                      | `#111827` / `#ffffff` | 17.74:1 | 4.5     | Body text on cards                       |
| `text` on `surface-subtle`               | `#111827` / `#f2f4f7` | 16.10:1 | 4.5     | Text on secondary buttons / hover rows   |
| `text` on `border`                       | `#111827` / `#d0d5dd` | 12.03:1 | 4.5     | Secondary button text on hover           |
| `text-muted` on `bg`                     | `#5b6475` / `#f6fafb` | 5.67:1  | 4.5     | Secondary text on app background         |
| `text-muted` on `surface`                | `#5b6475` / `#ffffff` | 5.96:1  | 4.5     | Secondary text on cards                  |
| `text-muted` on `surface-subtle`         | `#5b6475` / `#f2f4f7` | 5.41:1  | 4.5     | Muted text on muted surfaces             |
| `primary` on `bg`                        | `#0f6e56` / `#f6fafb` | 5.90:1  | 4.5     | Links on app background                  |
| `primary` on `surface`                   | `#0f6e56` / `#ffffff` | 6.20:1  | 4.5     | Links on cards                           |
| `on-primary` on `primary`                | `#ffffff` / `#0f6e56` | 6.20:1  | 4.5     | Primary button text                      |
| `on-primary` on `primary-hover`          | `#ffffff` / `#075743` | 8.56:1  | 4.5     | Primary button text on hover             |
| `on-accent` on `accent`                  | `#111827` / `#ed9e27` | 8.04:1  | 4.5     | Dark text on amber highlight             |
| `brand` on `surface`                     | `#1d9f73` / `#ffffff` | 3.36:1  | 3       | Brand green: large text and icons only   |
| `border-input` on `surface`              | `#7a8394` / `#ffffff` | 3.82:1  | 3       | Form control boundary on cards           |
| `border-input` on `bg`                   | `#7a8394` / `#f6fafb` | 3.63:1  | 3       | Form control boundary on app background  |
| `primary` on `surface`                   | `#0f6e56` / `#ffffff` | 6.20:1  | 3       | Focus ring on cards                      |
| `primary` on `bg`                        | `#0f6e56` / `#f6fafb` | 5.90:1  | 3       | Focus ring on app background             |
| `on-sidebar` on `sidebar`                | `#ffffff` / `#062a22` | 15.42:1 | 4.5     | Sidebar text                             |
| `on-sidebar-muted` on `sidebar`          | `#a7c4bb` / `#062a22` | 8.26:1  | 4.5     | Sidebar secondary text                   |
| `on-sidebar` on `sidebar-active`         | `#ffffff` / `#0f6e56` | 6.20:1  | 4.5     | Active sidebar item text                 |
| `focus-ring-inverse` on `sidebar`        | `#a7f3d0` / `#062a22` | 12.02:1 | 3       | Focus ring in the sidebar                |
| `focus-ring-inverse` on `sidebar-active` | `#a7f3d0` / `#0f6e56` | 4.84:1  | 3       | Focus ring on active sidebar item        |
| `neutral-700` on `surface-subtle`        | `#344054` / `#f2f4f7` | 9.49:1  | 4.5     | Neutral status badge                     |
| `success-700` on `success-50`            | `#067647` / `#ecfdf3` | 5.40:1  | 4.5     | Success status badge                     |
| `warning-700` on `warning-50`            | `#8a5a00` / `#fff4e0` | 5.44:1  | 4.5     | Warning status badge                     |
| `danger-700` on `danger-50`              | `#b42318` / `#fef3f2` | 6.05:1  | 4.5     | Danger status badge / destructive button |
| `info-700` on `info-50`                  | `#175cd3` / `#eff8ff` | 5.57:1  | 4.5     | Info status badge                        |
| `success-700` on `surface`               | `#067647` / `#ffffff` | 5.69:1  | 4.5     | Success message text on cards            |
| `warning-700` on `surface`               | `#8a5a00` / `#ffffff` | 5.93:1  | 4.5     | Warning message text on cards            |
| `danger-700` on `surface`                | `#b42318` / `#ffffff` | 6.57:1  | 4.5     | Error message text on cards              |
| `info-700` on `surface`                  | `#175cd3` / `#ffffff` | 5.99:1  | 4.5     | Info message text on cards               |
| `on-primary` on `danger-700`             | `#ffffff` / `#b42318` | 6.57:1  | 4.5     | Destructive button text on hover         |
| `chart-1` on `surface`                   | `#0f6e56` / `#ffffff` | 6.20:1  | 3       | Chart series 1 on cards                  |
| `chart-1` on `bg`                        | `#0f6e56` / `#f6fafb` | 5.90:1  | 3       | Chart series 1 on app background         |
| `chart-2` on `surface`                   | `#2563eb` / `#ffffff` | 5.17:1  | 3       | Chart series 2 on cards                  |
| `chart-2` on `bg`                        | `#2563eb` / `#f6fafb` | 4.92:1  | 3       | Chart series 2 on app background         |
| `chart-3` on `surface`                   | `#b54708` / `#ffffff` | 5.43:1  | 3       | Chart series 3 on cards                  |
| `chart-3` on `bg`                        | `#b54708` / `#f6fafb` | 5.16:1  | 3       | Chart series 3 on app background         |
| `chart-4` on `surface`                   | `#7a5af8` / `#ffffff` | 4.52:1  | 3       | Chart series 4 on cards                  |
| `chart-4` on `bg`                        | `#7a5af8` / `#f6fafb` | 4.30:1  | 3       | Chart series 4 on app background         |
| `chart-5` on `surface`                   | `#c11574` / `#ffffff` | 5.79:1  | 3       | Chart series 5 on cards                  |
| `chart-5` on `bg`                        | `#c11574` / `#f6fafb` | 5.51:1  | 3       | Chart series 5 on app background         |

Changes from the kit's proposed palette: **added `--vl-color-focus-ring-inverse` `#a7f3d0`** — the primary colour as a
focus ring on the dark sidebar is only 2.49:1 (a test documents this); dark surfaces use the class `surface-dark` to
switch to the inverse ring. Slice 1.3a added **`--vl-color-scrim` `#101828`** (`bg-scrim/60`) for modal/drawer backdrops — non-text, so no contrast pair. Slice 1.3b added **`--vl-color-chart-1…5`** (categorical series colours, D-060): graphics only, each ≥ 3:1 on `surface` and `bg`; never the only cue (legends, dash styles and a table view are required). Corrected the kit's "ink on amber" figure from 7.89:1 to 8.04:1. Never use as text:
`brand` (3.36:1, large text/icons only), `accent` amber (2.21:1 on white), `border` (decorative, 1.47:1),
`border-input` (boundaries only).

**Typography (D-059).** Inter Variable, self-hosted from `@fontsource-variable/inter` (all subsets declared with
unicode ranges, so `₹` from latin-ext loads — the E2E suite checks this). Fallback stack: `ui-sans-serif, system-ui,
-apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`. Scale 12/14/16/18/20/24/30/36 = Tailwind `text-xs` …
`text-4xl`; body 16px, line height 1.5; `tabular-nums` for tables and KPIs.

**Shape, depth, layering, motion.** Radius 8px controls (`rounded-lg`) / 12px cards (`rounded-xl`); 4px spacing
grid (Tailwind default); `shadow-card` and `shadow-overlay`; z-index tokens sticky 10 · sidebar 20 · overlay 40 ·
modal 50 · toast 60; durations 120/200ms with a standard easing; all animation and transition durations collapse
under `prefers-reduced-motion: reduce`. Light theme only; `dark:` utilities apply only under a `.dark` class that the
app never sets.

**Icons.** Lucide (`lucide-react`), outline style, decorative icons `aria-hidden`.
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

### Status tones (implemented in Slice 1.3a — `apps/web/src/lib/status.ts`, `StatusBadge`)

Every status renders as exact label + tone colour + tone icon (icon shape differs per tone, so status never relies on
colour alone). Tones fixed by `.claude/rules/web.md` are tested; the rest are **Proposed** (owner may change them;
update `status.ts` and this table together).

| Tone | Icon | Statuses | Source |
|---|---|---|---|
| Success (green) | check circle | Active, Published, Compliant, Completed | web rule |
| Success (green) | check circle | Valid, Passed, Present, Paid, Succeeded | **Proposed** |
| Info (blue) | loader | In Progress | web rule |
| Info (blue) | loader | Submitted, Queued, Running | **Proposed** |
| Warning (amber text on amber tint) | clock | Due Soon, Under Review, Trial | web rule |
| Warning | clock | Late, Retrying, Partially Refunded | **Proposed** |
| Danger (red) | alert circle | Overdue, Suspended, Failed, Revoked | web rule |
| Danger (red) | alert circle | Expired, Absent | **Proposed** |
| Neutral | dashed circle | Draft, Not Started | web rule |
| Muted (grey) | archive | Archived, Cancelled | web rule |
| Muted (grey) | archive | Superseded, Excused, Refunded, Not Applicable, Pending | **Proposed** |

### Component conventions (Slice 1.3a)

- Gallery: `/design/components` (dev only, same `ENABLE_DESIGN_GALLERY` gate as `/design`).
- Visible text comes from props with English defaults in `apps/web/src/messages/en.ts` (routed through i18n in 1.4).
- `FormField` wires label, "(required)" text, help and error (`aria-describedby`, `aria-invalid`, polite live region);
  controls receive the wiring via a render prop.
- `ConfirmDialog` (Radix AlertDialog) requires an impact statement and a named action label; focus returns to the
  trigger; clicking outside does not dismiss it.
- Dates: `formatDateTime` always shows the zone (`21 Oct 2026, 00:15 IST`; non-Indian zones may render as `GMT-5`
  under the en-IN locale); date-only values (`YYYY-MM-DD`) are never timezone-shifted. Money: integer minor units +
  ISO currency, formatted exactly (`₹1,25,00,000.50`).
- shadcn components are added with `pnpm dlx shadcn@4.22.1 add <name>` and then reviewed (see Slice 1.3a report in
  `docs/progress-log/2026-10.md`): import `cn` from `@/lib/utils`, no `dark:`, solid focus outlines (never
  semi-transparent rings), list highlights with an inset outline, token variables only (a unit test fails on any
  undefined `var(--x)` or default-palette colour class).

### Component conventions (Slice 1.3b)

- **Page structure:** `PageHeader` (one `h1`, breadcrumbs, inline meta such as StatusBadge/DemoBadge, actions with the
  primary last), `Breadcrumbs` (last entry is the current page, `aria-current="page"`, never a link), `Tabs` (`default`
  segmented variant for small toggles, `line` variant for page sections; active tab = bold + 2 px bar, not colour only),
  `Stepper` (display only; state in text: "Details (completed)", "Step 2 of 4"; `error` overrides a step).
- **States:** `EmptyState` (why it is empty + a real next step), `ErrorState` (`role="alert"`, shows the API
  `requestId`, optional retry; never raw server text), `PermissionDenied` (403 only, reveals nothing about the
  resource; scope-hidden resources are 404 and use a not-found page). Heading level is a prop to fit the outline.
- **Demo data:** `DemoBadge` ("Demo") on every fixture-backed card, chart or page; `KpiCard` and `ChartCard` take
  `demo`.
- **KpiCard:** a named group; value and change are pre-formatted server values; change has direction (icon + hidden
  words) and an explicit `sentiment` (up is not always good) for colour.
- **ChartCard:** title, always-visible text summary, Chart/Table tabs (the table is the accessible equivalent), and
  loading / error / empty states — no axes are drawn for data that does not exist. Charts use recharts 3 via the
  restyled shadcn wrapper (`components/ui/chart.tsx`); series colours are typed to `CHART_COLORS` (the chart tokens)
  and passed directly to recharts; the second series in a line chart uses a dash pattern.
- **DataTable (server-driven, no TanStack Table — D-060):** renders one page exactly as the API returned it; never
  sorts or filters locally. Sortable columns name the API's allowlisted sort field; headers expose `aria-sort`.
  Loading keeps the header with skeleton rows (`aria-busy`); error and empty replace the table. Row actions open a
  **non-modal** menu named "Actions for <row>"; destructive actions must open a ConfirmDialog. Selection covers the
  current page only and is cleared when the page, sort or filters change; the selected count is announced.
- **FilterBar** (`role="search"`, visible labels on every control, "Clear filters" only when something is applied)
  and **Pagination** (cursor-based previous/next with "Page N", rows-per-page 25/50/100; no totals, because cursor
  lists do not have them). `lib/table.ts` holds `nextSort`, `ariaSort`, `useCursorPagination` (cursor stack, reset on
  any query change) and `useDebouncedValue` for search. Filter values are hints: the API validates them and applies
  tenant/branch scope, so a filter can never widen access.
- Tables scroll inside a focusable container, so the page itself never scrolls sideways at 360 px (E2E-checked).

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

## Screen inventory (reconciled in Phase 0, 2026-10-20)

This is the single numbered inventory. Screens 1–46 keep the kit's numbering; 47–58 are screens Phase 0 found were
needed by the spec or the phase prompts but missing from the list. Routes follow the route groups in
`.claude/rules/web.md` and are **Proposed**. "Demo" = Phase 1 builds it on labelled demo data; the later phase
replaces the fixtures with real endpoints. **Flag** = shown only when that tenant feature flag (D-031) or decision
enables it. Reference images are direction only.

Route notes: tenant users never put a tenant id in the URL (tenant comes from the session). Public tenant pages use
`/t/{tenantSlug}` only to look up **public** data (D-021); subdomains/custom domains may replace this later. Secret
tokens (invitation, password reset, email verification) travel in the URL fragment `#t=…` so they never reach server
or proxy logs.

### Public and tenant website

| # | Screen | Route | Roles | Primary actions | Data | Phase · release | Ref | Flag / decision |
|---|---|---|---|---|---|---|---|---|
| 1 | Marketing landing | `/` | Public | Go to login, view catalog | Static, placeholder content | Layout 1.4 · content P7 | 10, 05 | D-038 placeholders only |
| 2 | Tenant public catalog home | `/t/[tenantSlug]` | Public | Browse, search | Public courses (marketing fields) | 3.7 · R2 | 05 | D-021 |
| 3 | Catalog search + filters | `/t/[tenantSlug]/courses` · `/learn/catalog` | Public · LRN | Search, filter, paginate | Entitled courses | 3.7 · R2 | 05 | Public variant: D-021 |
| 4 | Course detail + enrol | `/t/[tenantSlug]/courses/[slug]` · `/learn/catalog/[courseId]` | Public · LRN | Enrol (D-046) / buy (P6) / sign in | Course version marketing fields, eligibility, price | 3.7 · R2 (+4.1, 6.2) | 05 | D-046, commerce |
| 5 | Login · invitation accept · registration · password reset · email verification | `/login` · `/invite/accept#t=` · `/register` · `/reset-password#t=` · `/verify-email#t=` | Public | Sign in, accept, reset | Session, invitation preview | 2.3, 3.1 · R1–R2 | — | `/register` only if D-033 |
| 6 | Checkout result | `/checkout/[orderId]/result` | LRN | View order status (never grants access itself) | Order status from API | 6.2 · R4 | 05 | commerce, D-007 |

### Platform Admin

| # | Screen | Route | Roles | Primary actions | Data | Phase · release | Ref | Flag / decision |
|---|---|---|---|---|---|---|---|---|
| 7 | Platform dashboard | `/platform` | PSA | Filter date range, drill down | Tenant counts by status, learners, published courses, completion rate, activity | Demo 1.5.1 · real 2.2 + 6.4 | 01 | Revenue/plan widgets: D-027; industry widget: D-048 |
| 8 | Tenant list | `/platform/tenants` | PSA | Search, filter by status, create | Tenants | 2.2 · R1 | 01 | — |
| 9 | Tenant create / detail / edit / suspend / reactivate | `/platform/tenants/new` · `/platform/tenants/[id]` | PSA | Create, edit, suspend (reason), reactivate, archive | Tenant, branches summary, audit | 2.2 · R1 | — | — |
| 10 | Platform users and roles | `/platform/users` | PSA | Invite staff, assign platform roles | Platform users | 2.4 · R1 | 01 | — |
| 11 | Global course/content library | `/platform/library` | PSA | — | — | Not scheduled | 01 | D-043 candidate — omit |
| 12 | Integrations and system settings | `/platform/settings` | PSA | View provider status (no secrets) | Provider health | 7.4 · Launch | 01 | — |
| 13 | Audit logs (platform) | `/platform/audit` | PSA | Search, filter | AuditEvent (platform + support sessions) | 2.2 · R1 | 01 | — |
| 14 | Usage and subscription overview | `/platform/usage` | PSA | View | Usage, plans | 6.6 · R4 | 01 | D-027 |

### Tenant Admin

| # | Screen | Route | Roles | Primary actions | Data | Phase · release | Ref | Flag / decision |
|---|---|---|---|---|---|---|---|---|
| 15 | Tenant dashboard | `/admin` | TA (also BA/LM/CV, scope-aware — see 31) | Drill down | Learners, active courses, completion, compliance, deadlines, activity | Demo 1.5.2 · real 4.7 + 5.2 | 07 | Compliance tiles from P5 |
| 16 | Branch list / detail / create / edit | `/admin/branches` · `/admin/branches/[id]` | TA (BA read) | Create, edit, deactivate | Branches, counts | 2.5 · R1 | 07 | Map widget: D-043 — omit |
| 17 | Users and memberships | `/admin/users` · `/admin/users/[id]` | TA, BA | Search, filter, deactivate, reactivate, manage branches | Memberships (D-047 fields) | 2.5 · R1 | 07 | Bulk import button: D-044 |
| 18 | Groups and membership | `/admin/groups` · `/admin/groups/[id]` | TA, BA, LM | Create, edit, archive, add/remove members | Groups, members | 3.2 · R2 | 07 | — |
| 19 | Role assignments | `/admin/roles` | TA, BA (limited) | Assign, revoke | RoleAssignments | 2.4 · R1 | — | D-053 fixed roles |
| 20 | Invitations | `/admin/invitations` | TA, BA | Invite, resend, revoke | Invitations | 3.1 · R2 | 07 | D-050 |
| 21 | Course management | `/admin/courses` | TA (BA/LM/INS read) | Search, filter (category, level, format, status), create, archive | Courses + current version | Demo 1.5.3 · real 3.3 | 02 | "Under Review" tab: D-022; "Import": D-043 — omit |
| 22 | Course builder (Basic info → Content → Assessment → Settings → Publish; Pricing when commerce) | `/admin/courses/[id]/build/[step]` | TA | Save draft, reorder, preview, publish | Draft CourseVersion, modules, lessons, assets | Demo 1.5.3 · real 3.3–3.6, 4.4, 6.1 | 02 | Pricing: commerce |
| 23 | Assignments and enrollments | `/admin/assignments` · `/admin/assignments/[id]` · `/admin/enrollments/[id]` | TA, BA, LM | Create assignment, cancel, change due date, see "why this enrollment exists" | Assignments, targets, enrollments | 4.1 · R2 | 07 | D-004, D-032, D-045 |
| 24 | Assessment builder, question bank, results | `/admin/assessments` · `/admin/question-bank` | TA (results: BA, LM, CV) | Build, version, review results | Assessments, attempts | 4.4 · R2 | 07 | D-023 |
| 25 | Certificate templates and issued certificates | `/admin/certificates` | TA (search: BA, LM, CV) | Edit template, search, revoke, reissue | Templates, awards | 4.6 · R2 | 07 | "Expiring soon" tab from P5 |
| 26 | Compliance requirements and status | `/admin/compliance` | TA (status: BA, LM, CV) | Define requirement, view status, drill down | Requirements, computed status | 5.1–5.2 · R3 | 07 | D-018 |
| 27 | Surveys and results | `/admin/surveys` | TA (results: LM, CV) | Build, publish, close, view results | Surveys, aggregates | 5.4 · R3 | — | surveys flag, D-020 |
| 28 | Classroom sessions and attendance | `/admin/classroom` | TA, BA, LM | Create session, manage roster, cancel/reopen | ClassSessions, registrations | 5.5 · R3 | 05 | classroom flag, D-019 |
| 29 | Reports, filters and exports | `/admin/reports` · `/admin/reports/[reportKey]` | TA, BA, LM, CV | Filter, view scope banner, export CSV | Report rows + totals | Demo 1.5.8 · real 4.7, 5.2–5.3 | 07 | — |
| 30 | Branding and settings | `/admin/settings` · `/admin/settings/branding` | TA | Edit general settings, logo, colour (contrast-checked) | TenantSetting, TenantBranding | 2.5 (general) · 3.8 (branding) | 07 | Website/page builder, email-template tabs: D-043 / 5.6 |

### Branch Admin / Learning Manager

These reuse the tenant admin routes; navigation and data are filtered by the actor's scope (permission-driven nav).

| # | Screen | Route | Roles | Primary actions | Data | Phase · release | Ref | Flag / decision |
|---|---|---|---|---|---|---|---|---|
| 31 | Branch dashboard and scoped people | `/admin` · `/admin/users` (scoped) | BA, LM | As 15 and 17 within scope | Scoped | 2.5, 4.7 | 07 | D-026 |
| 32 | Team / group learning progress | `/admin/progress` | BA, LM, INS (assigned) | Filter, drill down | Enrollments + progress | 4.7 · R2 | 07 | — |
| 33 | Assignment creation and overdue follow-up | `/admin/assignments?status=overdue` | BA, LM | Assign, follow up | Overdue (derived, D-054) | 4.1 · R2 | 07 | Reminders: 5.6 |
| 34 | Compliance dashboard and scoped reports | `/admin/compliance` (scoped) | BA, LM, CV | View, export | Scoped compliance | 5.2 · R3 | 07 | — |

### Instructor

| # | Screen | Route | Roles | Primary actions | Data | Phase · release | Ref | Flag / decision |
|---|---|---|---|---|---|---|---|---|
| 35 | Instructor dashboard | `/instructor` | INS | Go to sessions, results | Own sessions, learners | 5.5 · R3 | — | classroom flag |
| 36 | Assigned courses and permitted content editing | `/instructor/courses` | INS | View (edit off by default) | Courses linked to own sessions | 5.5 · R3 | — | Editing: owner decision (matrix note) |
| 37 | Session calendar, roster and attendance | `/instructor/sessions` · `/instructor/sessions/[id]` | INS | Mark attendance (audited) | Own sessions | 5.5 · R3 | 05 | — |
| 38 | Assessment results and learner progress | `/instructor/results` | INS | Review attempts | Assigned learners | 4.4 (read) / 5.5 · R2–R3 | — | D-023 |

### Learner

| # | Screen | Route | Roles | Primary actions | Data | Phase · release | Ref | Flag / decision |
|---|---|---|---|---|---|---|---|---|
| 39 | Learner dashboard | `/learn` | LRN | Continue, start, view deadlines | Own enrollments, deadlines, recent certificates | Demo 1.5.4 · real 4.2 | 03 | Achievements, announcements, ratings, "learning plan": omit (D-043, D-025) |
| 40 | My Learning (assigned, in progress, completed, overdue, available) | `/learn/my-learning` | LRN | Filter, continue | Own enrollments | 4.2 · R2 | 03 | Available: D-046 |
| 41 | Course detail and learning player | `/learn/courses/[enrollmentId]` · `/learn/courses/[enrollmentId]/lessons/[lessonId]` | LRN | Play, resume, prev/next, mark complete (if allowed) | Pinned course version, progress | Demo 1.5.5 · real 4.3 | 13 | Notes, discussion, resources, bookmarks, quick quiz: omit (D-043) |
| 42 | Assessment taking and results | `/learn/attempts/[attemptId]` | LRN | Answer, submit, see result | Attempt, timer from server | Demo 1.5.6 · real 4.4 | 05 | D-023, D-055 |
| 43 | Certificates and public verification | `/learn/certificates` · `/verify/[verificationId]` | LRN · Public | Download PDF · verify | Own awards · minimal verification data | Demo 1.5.7 · real 4.6 | 05 | D-017 |
| 44 | Classroom session discovery / registration | `/learn/sessions` | LRN | Register, cancel | Eligible sessions | 5.5 · R3 | — | classroom flag |
| 45 | Surveys and feedback | `/learn/surveys` | LRN | Respond | Eligible surveys | 5.4 · R3 | — | surveys flag |
| 46 | Profile and notifications | `/account` · `/account/notifications` | All signed-in | Edit profile, change password, preferences | Own user, notifications | 2.3 (account) · 5.6 (notifications) | 03 | — |

### Added in Phase 0

| # | Screen | Route | Roles | Why it is needed | Phase · release | Flag / decision |
|---|---|---|---|---|---|---|
| 47 | Workspace (tenant) picker | `/select-workspace` (+ switcher in the top bar) | Multi-tenant users | MASTER_PROMPT §2: one user, several tenants | 1.4 shell · 2.4 real | — |
| 48 | Commerce admin: offers, orders, refunds, reconciliation | `/admin/commerce` | TA | Spec §14 admin reconciliation; screen 22 only covers pricing | 6.1–6.3 · R4 | commerce, D-007/D-008/D-029 |
| 49 | Learner order history | `/learn/orders` | LRN | Spec §14 "visible to learner" | 6.3 · R4 | commerce |
| 50 | Analytics dashboards and governed report builder | `/admin/analytics` | TA, BA, LM, CV (read) | Spec §15 saved reports; screen 29 covers basic reports only | 6.4–6.5 · R4 | — |
| 51 | Export jobs | `/admin/exports` | Requester | Spec §11 "failed exports visible and retryable" | 5.3 · R3 | — |
| 52 | Categories and tags | `/admin/settings/catalog` | TA | Phase 3.3; image 02 "Manage Categories" | 3.3 · R2 | — |
| 53 | Departments and job roles | `/admin/settings/people` | TA | Spec §11 applicability by department/job role | 2.5 · R1 | D-047 |
| 54 | Notification templates | `/admin/settings/notifications` | TA | Phase 5.6 tenant templates | 5.6 · R3 | — |
| 55 | Support access session | `/platform/tenants/[id]/support` + banner | PSA | D-037 audited support access | 2.4 · R1 | D-037 |
| 56 | System states: 403, 404, 500, session expired, tenant suspended | `/forbidden`, `not-found`, `error`, `/suspended` | All | Required states (spec §16) | 1.4 · 2.3 | — |
| 57 | Dev-only design system gallery | `/design` (excluded from production builds) | Developers | Phase 1.2–1.3 gallery | 1.2 | — |
| 58 | Branch compliance comparison | `/admin/reports/branch-comparison` | TA, LM, CV | Spec §11 "branch comparison" report | 5.2 · R3 | D-026 (grouping) |

Compliance Viewer has no workspace of its own: it uses `/admin/*` with a read-only, scoped navigation.

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
