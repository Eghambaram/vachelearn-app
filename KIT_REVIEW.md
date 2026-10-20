# Starter Kit Review — v1.0 → v2.0

Review date: 2026-10-20. Inputs reviewed: `MASTER_PROMPT.md` v1.0, `docs/Supplementary_Master_Prompt.md`, all 12
Markdown docs, `docs/VacheLearn_MVP_Implementation_Specification.docx` (24 sections, 104 acceptance criteria),
`.env.example`, 12 UI reference images, the brand logo, 43 + 5 pages of legacy screenshots and the 26-page legacy ERD.

## What was missing (now added)

| Gap | Why it mattered | Added |
|---|---|---|
| No `CLAUDE.md` | Claude Code loads `CLAUDE.md` automatically every session; without it, rules lived only in a prompt you paste once and are lost after `/clear` or compaction | `CLAUDE.md` (< 200 lines, imports `docs/PROGRESS.md`) |
| No path-scoped conventions | API, DB, web and test conventions would either bloat CLAUDE.md or be absent | `.claude/rules/{api,database,web,testing,docs}.md` — load only for matching files |
| No session continuity | Multi-week build across many sessions had no "where are we" file | `docs/PROGRESS.md` + `/handoff` skill + `prompts/session-resume.md` |
| No per-phase prompts | One giant prompt for 8 phases invites "build everything at once" | `prompts/phase-0` … `phase-7` with slices, ACs, exit gates, report formats |
| No enforcement | Instructions are advisory; secrets protection must be hard | `.claude/settings.json` deny rules + `guard-secrets` hook (blocks `.env`/key edits and live-looking credentials) |
| No independent verification | "Never claim tests passed" needs a second pair of eyes | Subagents: `qa-verifier`, `tenant-isolation-auditor`, `security-reviewer`, `ux-accessibility-reviewer` |
| Spec only as .docx | Claude Code reads Markdown far more reliably than .docx | `docs/MVP_SPEC.md` (pandoc conversion, all ACs preserved) |
| Legacy PDFs are image-only (admin + learner) | Claude would have to OCR/view 48 screenshots each session | `docs/LEGACY_CAPABILITY_INVENTORY.md` (capability map, anti-patterns, glossary) |
| No design tokens | "Deep green/teal + amber" is not implementable | Tokens sampled from the logo and dashboard reference, with computed contrast ratios |
| Decisions without IDs or blocking phase | Prompts could not reference them; unclear urgency | `docs/DECISIONS.md` rebuilt with D-001…D-043, "Blocks" column |
| Auth approach unstated | Auth shapes every later phase | D-010 proposal with alternatives |
| No concrete tenant-isolation technique | "Scope every query" is a wish; composite FKs make the DB enforce it | Composite `(tenant_id, id)` FK pattern + isolation test recipe + `/isolation-tests` skill |

## Contradictions found and how v2.0 resolves them

| # | Contradiction | Resolution |
|---|---|---|
| 1 | Phase numbering: v1 master (0–7, design system = Phase 1) vs Supplementary (0–6, foundation = Phase 1) vs spec sprints (0–6) | Canonical 0–7 from v1 master; mapping table in MASTER_PROMPT §9 |
| 2 | Supplementary prompt assumes an **existing repository** ("preserve working code", `IMPLEMENTATION_AUDIT.md`) while README/v1 say greenfield | Greenfield stance kept; "inspect and preserve if code appears" retained as a safety rule; audit folded into Phase 0 docs |
| 3 | Screen inventory: 41 screens (v1 master) vs 46 (UI spec) | UI spec's 46 is the base; Phase 0 reconciles into one numbered list with routes and phases |
| 4 | ORM: "Prisma" (v1) vs "Prisma or Drizzle" (spec, Supplementary) | Prisma Proposed (D-005); one ORM only |
| 5 | Phase 1 builds UI before any backend, but nothing said how to avoid throwaway work | Demo screens consume fixtures through the same typed client interface the API will implement; "Demo data" badge; fixtures removed as real endpoints land |
| 6 | Reference images show features absent from the spec (Achievements, Messages, Calendar, Notes, Discussion, Announcements, ratings, Quick Quiz, subscriptions/MRR, "Under Review") | Listed as out of scope or Needs decision (D-022, D-027, D-043); omit rather than ship inert UI |
| 7 | Mission mentions "learning paths" but no requirement defines them; legacy has programmes | D-025 Needs decision |
| 8 | Domain inventory uses `Session` for both auth sessions and classroom sessions | Classroom entity renamed `ClassSession`; auth uses `AuthSession` |
| 9 | "Survey" status names, enrollment statuses and compliance statuses varied between docs | Single status vocabulary table in `docs/UI_UX_SPECIFICATION.md` |
| 10 | Basic reports: spec puts them in Core Learning MVP; v1 master puts reports in Phase 5 | Basic progress/completion/overdue reports in Phase 4; compliance reports + exports in Phase 5 |

## Risks flagged

- **Reference image 10 (public landing page) shows real third-party logos** (Tata, Reliance, JSW, Adani, L&T, Mahindra,
  Bosch, Schneider Electric, Cummins, Siemens) in a "Trusted by industry leaders" strip, plus a customer quote. Shipping
  these without permission is a trademark and false-endorsement risk. Rule added (D-038, CLAUDE.md, web rule).
- **The legacy system is ExpertusOne**, a third-party product. Its screens are workflow evidence only; v2.0 says so
  explicitly so its branding/layout is not reproduced.
- **Legacy ERD includes a `password` column in `users_profile`.** If migration happens, legacy credentials must not be
  imported without a security review; forced reset is the recommended path.
- **Brand green `#1D9F73` fails AA for body text on white (3.36:1)** and amber `#ED9E27` fails as text (2.21:1). Tokens
  separate a darker `primary` (`#0F6E56`, 6.20:1) for text and buttons; brand green and amber are restricted to large
  text, icons, fills and dark-text-on-amber.
- **India-first market signals** (₹ in references, user timezone): payment provider, GST/invoicing and DPDP Act 2023
  obligations need owner + counsel decisions before commerce or production (D-007, D-014, D-029, D-034).
- The `.env.example` placeholder `DATABASE_URL` uses `change-me` — fine for local; the guard hook allows it.

## Unchanged (still valid from v1.0)

`docs/PRODUCT_REQUIREMENTS.md`, `ARCHITECTURE.md`, `DOMAIN_MODEL.md`, `ROLE_PERMISSION_MATRIX.md`,
`IMPLEMENTATION_PLAN.md`, `ACCEPTANCE_TESTS.md`, `MIGRATION_MAPPING.md`, `RUNBOOK.md`, `.env.example` — Phase 0 is
instructed to expand them; they were not rewritten here to avoid pre-empting the Phase 0 discovery work.
`docs/Supplementary_Master_Prompt.md` is kept for history with a "superseded" banner.
