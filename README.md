# VacheLearn Starter Kit (v2.0)

**Greenfield Claude Code starter kit** for VacheLearn — a multi-tenant industrial learning and workforce-readiness
platform. Contains the build constitution, Claude Code configuration, phase-by-phase prompts, requirements, design
references and legacy evidence. **No application has been implemented yet.**

## Start here

### Run the app (Phase 1 onwards)

Prerequisites: Git, Node.js **24 LTS** (see `.nvmrc`), pnpm **12.8.1** (see `packageManager` in `package.json`).
Docker is needed from Phase 2.

```bash
pnpm install                                        # refuses unsupported Node versions on a fresh install
pnpm dev                                            # web app on http://localhost:3000
pnpm verify                                         # format check, lint, typecheck, unit tests, production build
pnpm --filter web exec playwright install chromium  # once per machine (CI adds --with-deps)
pnpm test:e2e                                       # Playwright smoke + axe accessibility checks
```

Status: Phase 1 Slice 1.1 — workspace and tooling only. The web app shows a placeholder page; no features exist yet.

### Working with Claude Code

1. Open a terminal in this folder and run `claude`. `CLAUDE.md`, `.claude/rules/`, skills, agents and hooks load
   automatically. Run `/context` to confirm.
2. Phase 0 (planning) is complete — see `docs/PROGRESS.md` for the current phase and next step.
3. Answer the decisions Claude raises (they are tracked in `docs/DECISIONS.md`).
4. For each phase type `/start-phase N`, approve the slice plan, and let Claude implement one slice at a time.
   End each session with `/handoff`. Resume with `prompts/session-resume.md`.

## What's in the kit

| Path | Purpose |
|---|---|
| `CLAUDE.md` | Always-loaded operating manual: non-negotiables, stack, commands, workflow, conventions |
| `MASTER_PROMPT.md` | Product brief and build constitution (v2.0, consolidated) |
| `prompts/` | Kickoff, Phase 0–7 prompts, session resume, review prompts |
| `.claude/rules/` | Path-scoped conventions (API, database, web, testing, docs) |
| `.claude/skills/` | `/start-phase`, `/slice`, `/verify`, `/decision`, `/isolation-tests`, `/handoff` |
| `.claude/agents/` | Independent reviewers: tenant isolation, security, UX/accessibility, QA verification |
| `.claude/settings.json`, `.claude/hooks/` | Permission allow/ask/deny lists; secret-guard and auto-format hooks (need Node) |
| `docs/` | Requirements, spec (`MVP_SPEC.md` + original .docx), decisions, domain, roles, UI/UX, tests, plan, runbook, progress |
| `docs/LEGACY_CAPABILITY_INVENTORY.md` | What the legacy LMS did, extracted from the image-only PDFs |
| `assets/` | Brand logo and generated UI reference images (direction only — fake data, see caveats in UI spec) |
| `reference/legacy/` | Original legacy admin/learner screenshots and ERD (third-party product; evidence only) |
| `KIT_REVIEW.md` | What changed from v1.0, contradictions resolved, risks flagged |
| `.env.example` | Placeholder environment variables — never put real secrets in Git |

## Personal overrides

Put personal, uncommitted preferences in `CLAUDE.local.md` or `.claude/settings.local.json` (both git-ignored).

## Important

Never add production secrets to Git or paste them into a prompt. Claude is blocked from reading `.env` files; set real
values yourself. Reference images contain real third-party logos and invented testimonials/metrics — never ship them.
