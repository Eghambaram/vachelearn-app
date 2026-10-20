---
paths:
  - "apps/web/**"
  - "packages/ui/**"
---

# Web rules (Next.js App Router + Tailwind + shadcn/ui)

## Structure

```
apps/web/src/
  app/
    (public)/            # marketing site, tenant catalog, course detail, verify certificate, login, invite accept
    (platform)/platform/ # Platform Super Admin workspace
    (tenant)/admin/      # Tenant Admin, Branch Admin, Learning Manager, Compliance Viewer (permission-driven nav)
    (instruct)/instructor/
    (learn)/learn/       # Learner workspace
  components/            # app-specific composites (PageHeader, DataTable wrappers, KPI cards)
  features/<module>/     # screens, hooks and API calls per bounded context
  lib/api/               # typed API client (generated from OpenAPI or built on packages/contracts)
  lib/auth/              # session helpers (read-only; the API is the authority)
  mocks/                 # Phase 1 demo fixtures only — deleted/unused once the real endpoint exists
  styles/tokens.css      # design tokens (CSS variables) — single source of colour/spacing/radius/shadow
```

## Data and security

- The API is the authority for authentication, authorization, tenant and branch scope. Server components and
  middleware may redirect for UX, but never replace an API check. Never put secrets in `NEXT_PUBLIC_*`.
- Fetch through `lib/api` only. Handle `401` (redirect to login), `403` (permission-denied state), `404`, `409`
  (show conflict + reload option), `422` (map `fieldErrors` onto form fields).
- Session cookie is httpOnly, Secure, SameSite=Lax; the web app never reads or stores tokens in `localStorage`.
- Phase 1 demo screens read from `mocks/` through the **same** client interface that the real API will satisfy, and
  render a visible "Demo data" badge. A screen is not "done" until it uses the real endpoint.
- Never trust client-side computed scores, progress, prices or permissions — display what the API returns.

## Design system

- Tokens first (`styles/tokens.css` + Tailwind theme mapping), then primitives (shadcn/ui, restyled), then composites:
  AppShell (sidebar + top bar), PageHeader (title, subtitle, primary action), DataTable (search, filters, sort,
  pagination, row actions, bulk select), FilterBar, StatusBadge, KpiCard, ChartCard (with table equivalent),
  EmptyState, ErrorState, PermissionDenied, Skeletons, ConfirmDialog, FormField, Stepper, Tabs, Drawer, Toast.
- Use tokens, never raw hex values in components. Proposed palette (verify contrast before locking — see
  `docs/UI_UX_SPECIFICATION.md` §Design tokens): primary `#0F6E56`, primary-hover `#075743`, brand `#1D9F73`,
  accent/amber `#ED9E27`, sidebar `#062A22`, background `#F6FAFB`, surface `#FFFFFF`.
- Status language and colours are consistent everywhere: Published/Active/Compliant/Completed (green), Draft/Not
  Started (neutral), In Progress (blue), Due Soon/Under Review/Trial (amber), Overdue/Suspended/Failed/Revoked (red),
  Archived/Cancelled (grey). Always text + colour (+ icon where useful).
- Charts: every chart has a title, accessible summary, and a "view as table" alternative. No chart for data that does
  not exist yet — show an empty state instead.

## Accessibility (WCAG 2.2 AA target)

- Semantic HTML first; every input has a visible label; errors are linked with `aria-describedby` and announced.
- Full keyboard path for primary flows; visible focus ring (do not remove outlines); focus moves into dialogs and
  returns on close; skip-to-content link in AppShell.
- Target size ≥ 24×24 px; contrast ≥ 4.5:1 for text, 3:1 for UI components and large text.
- Video player: captions toggle, keyboard controls, no autoplay with sound; documents have a download alternative.
- Run automated checks (axe via Playwright) on primary screens; automated checks are not a claim of conformance.

## Learner experience

- Mobile-first for `(learn)`: works at 360 px, no hover-only interactions, sticky "Continue"/"Next lesson" actions.
- Clearly distinguish: course completed · assessment passed · attendance recorded · certificate issued.
- "Mark as complete" appears only when the lesson's completion policy allows manual completion; the server decides.
- Resume returns to the last lesson/position from the server, not from local storage.

## Copy and content

- Use plain, specific labels ("Publish version 2", not "Submit"). Dates show timezone where ambiguity matters.
- No third-party company logos, invented testimonials, fake customer counts or fake ratings on the marketing site.
  Use marked placeholders (`[Customer logo — permission required]`) until real, approved content exists.
- All user-facing strings go through the i18n helper from the start (English only initially), so localisation does
  not require a rewrite later.
