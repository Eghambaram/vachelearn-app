# Phase 1 — Design system & UI foundations

**Release:** none (prototype) · **Builds:** `apps/web` (+ `packages/ui` only if justified) · **Exit:** owner has
reviewed the shell, tokens and key screens on labelled demo data. Nothing here counts as a working feature.

## Message to send

```text
Start Phase 1 from prompts/phase-1-design-system.md. Begin with Slice 1.1 only. Show me the plan (files, commands,
dependencies with reasons) before scaffolding, then implement, run the gates, and report.
```

## Read first

`docs/UI_UX_SPECIFICATION.md` (inventory, layout, tokens) · `.claude/rules/web.md` · images `assets/ui-ux/01-platform-
admin-dashboard-final.png`, `02-course-management-builder.png`, `03-learner-dashboard.png`,
`13-course-player-reference.png`, `05-…storyboard.png`, `07-admin-workflows-composite.png` · `assets/brand/vache-logo.jpg`
· decisions D-024, D-028, D-038.

## Principles for this phase

- Screens consume demo fixtures through the **same typed client interface** the real API will implement
  (`lib/api/*` → `mocks/*` in Phase 1). Define those types now from `docs/DOMAIN_MODEL.md`; they become contracts.
- Every demo screen shows a visible **"Demo data"** badge. No real company names, logos, people or testimonials.
- No inert controls. A control either works against the demo layer (filter, sort, paginate, open drawer, navigate)
  or is omitted. Mutations that need a backend show a clearly labelled "Not yet connected" state, not fake success.
- Omit UI regions for out-of-scope features (Achievements, Notes, Discussion, Messages, Announcements, ratings)
  unless the owner has scheduled them.

## Slices

### 1.1 Workspace + web scaffold + tooling
pnpm workspace root, `apps/web` (Next.js App Router, TypeScript strict), ESLint, Prettier, `tsconfig` base, path
aliases, Vitest + Testing Library, Playwright with axe, root scripts (`dev`, `lint`, `format:check`, `typecheck`,
`test`, `test:e2e`, `build`, `verify`), `.editorconfig`, `.gitignore`, `.nvmrc` (current Active LTS), CI workflow
running `pnpm verify`.
**AC:** `pnpm install && pnpm verify` passes on a clean clone; CI file exists; CLAUDE.md Commands table updated with
real commands; README has setup steps.

### 1.2 Design tokens + theme
`styles/tokens.css` (colour, typography scale, spacing, radius, shadow, z-index, motion), Tailwind mapping, shadcn/ui
initialised and restyled, font choice (self-hosted, e.g. Inter or similar — record in DECISIONS), light theme
(dark theme optional, Proposed). Run contrast checks on every text/background pair and adjust the proposed palette
where it fails AA; record final values in `docs/UI_UX_SPECIFICATION.md`.
**AC:** a `/design` (dev-only) page renders the token sheet and component gallery; contrast table committed; no raw
hex values outside tokens (lint rule or grep check).

### 1.3 Core components
Button, IconButton, Input, Select, Combobox, Checkbox, Radio, Switch, Textarea, FormField (label, help, error),
DatePicker, Badge/StatusBadge (full status vocabulary), Avatar, Card, KpiCard, ChartCard (+ table toggle), DataTable
(search, filters, sort, pagination, row actions, bulk select, empty/loading/error), FilterBar, Tabs, Stepper,
Dialog, ConfirmDialog (states impact), Drawer, Toast, Skeleton, EmptyState, ErrorState, PermissionDenied, Pagination,
Breadcrumbs, PageHeader.
**AC:** each component in the gallery with states; keyboard + focus verified; axe passes on the gallery; unit tests
for StatusBadge mapping, DataTable sort/paginate, ConfirmDialog focus return.

### 1.4 App shells + navigation
Public layout (marketing header/footer), Auth layout, Workspace AppShell (dark green sidebar, top bar: search,
notifications, help, locale, user menu, tenant switcher for multi-tenant users), role-based nav definitions for
Platform, Tenant Admin, Branch Admin/Learning Manager, Instructor, Learner. Mobile: collapsible sidebar, bottom-safe
actions for learner. Skip link, landmarks.
**AC:** nav renders per demo role (role switcher on dev only); works at 360 px and 1440 px; keyboard-only navigation
through shell verified in Playwright.

### 1.5 Key screens on demo data (one per sub-slice, in this order)
1. Platform Admin dashboard (ref 01-final): KPIs, tenant growth, tenants by status, recent tenants, activity. Revenue/
   plan widgets only behind a "subscriptions" flag (D-027) — off by default.
2. Tenant Admin dashboard (ref 07 panel 1).
3. Course list + Course builder steps (ref 02): Basic info → Content → Assessment → Settings → Publish (stepper,
   module/lesson tree with drag-reorder via keyboard too).
4. Learner dashboard (ref 03) without out-of-scope regions.
5. Course player (ref 13): lesson tree, player area, prev/next, progress; Notes/Discussion omitted.
6. Assessment taking + result.
7. Certificate view + public verification page.
8. Compliance/report screen with filters, scope banner ("Scope: Branch A1 · Filters … · Generated … IST") and CSV
   button (disabled with "Available in Phase 5" tooltip).
**AC (each):** matches reference intent (not pixel copy); loading/empty/error/permission states demonstrable via
fixture toggles; responsive; axe clean; Playwright smoke test opens the screen; "Demo data" badge visible.

## Exit gate

- [ ] `pnpm verify` and `pnpm test:e2e` pass (real output in report)
- [ ] Token contrast table committed; palette adjustments recorded
- [ ] Gallery + 8 screens reviewed by the owner (screenshots in report via Playwright)
- [ ] `ux-accessibility-reviewer` subagent review done and findings resolved or logged
- [ ] No backend claims; all demo data labelled; no third-party logos or fake testimonials

## Report format

Slice → files changed → commands run with results → screenshots (paths) → known gaps → next slice.

## Change log

- v2.0 — from MASTER_PROMPT v1 Phase 1; added contract-first demo layer, out-of-scope region omission, contrast step.
- 2026-10-21 — Slice 1.3 split into 1.3a/1.3b and Slice 1.5.3 split into 1.5.3a (course list) / 1.5.3b (builder), both
  with owner approval, to keep change sets reviewable (D-067).
- 2026-10-26 — Slice 1.5.8: the CSV button is disabled with its reason as visible text beside it instead of a tooltip
  (a disabled button cannot receive focus, so a tooltip would be unreachable by keyboard and touch).
