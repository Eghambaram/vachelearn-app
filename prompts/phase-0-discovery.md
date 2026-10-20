# Phase 0 — Discovery & plan

**Release:** none · **Code:** none (documentation only) · **Exit:** product owner has reviewed the plan and answered
the decisions that block Phases 1–2.

## Message to send

```text
Run Phase 0 from prompts/phase-0-discovery.md. Documentation and planning only — no application code, no
scaffolding, no dependency installs. Use plan mode for your first pass, then write the documents listed under
"Deliverables". End with the Phase 0 report.
```

## Read first

- `MASTER_PROMPT.md` (all), `CLAUDE.md`
- `docs/MVP_SPEC.md` (Markdown copy of the .docx spec — all 24 sections + Appendix A)
- `docs/DECISIONS.md`, `docs/ROLE_PERMISSION_MATRIX.md`, `docs/DOMAIN_MODEL.md`, `docs/ACCEPTANCE_TESTS.md`
- `docs/UI_UX_SPECIFICATION.md` and the images in `assets/ui-ux/` (view at least 01-final, 02, 03, 13, 05, 07)
- `docs/LEGACY_CAPABILITY_INVENTORY.md` (already extracted from the image-only legacy PDFs; open the PDFs in
  `reference/legacy/` only to confirm a specific detail)
- `KIT_REVIEW.md` (known gaps and contradictions in this kit)

## Tasks

1. **Workspace audit.** `pwd`, list files, `git status` (initialise git only if absent, and say so), versions of
   node, pnpm/npm, docker + compose, git, OS. Note missing tools and the exact install commands. Do not install.
2. **Reconcile the brief.** List contradictions/gaps between MASTER_PROMPT, the spec, the docs and the images
   (e.g. screen counts, phase numbering, status names, features visible in images but out of scope). Propose a
   resolution for each; do not silently choose.
3. **Decisions.** Update `docs/DECISIONS.md`: keep IDs, add any new ones, add a **"Blocks phase"** column, and order the
   "Needs decision" items by when they block work. For each, give the recommended default and its consequence.
4. **Product requirements.** Refresh `docs/PRODUCT_REQUIREMENTS.md` with: personas, MVP boundary (R1–R4), in/out of
   scope, and a requirements index keyed to spec sections (e.g. `REQ-C-03 → spec §6 AC3`).
5. **Screen inventory.** In `docs/UI_UX_SPECIFICATION.md`, reconcile to one numbered inventory (the 46-screen list is the
   base). For each screen: route, role(s), primary actions, data needed, phase/release, reference image. Mark screens
   that only exist when a feature flag/decision enables them.
6. **Domain model draft.** Expand `docs/DOMAIN_MODEL.md`: every entity classified global / tenant-owned /
   branch-scoped; key fields; lifecycle states and allowed transitions (state tables for Course/CourseVersion,
   Enrollment, Attempt, CertificateAward, Invitation, ClassSession, Order); uniqueness and idempotency keys;
   immutability rules; a Mermaid ER diagram for R1 + R2 entities. No Prisma schema yet.
7. **Permissions.** Turn `docs/ROLE_PERMISSION_MATRIX.md` into permission keys (`resource.action`) × default roles ×
   scope, plus the rules for granting (no elevation beyond own grants).
8. **Architecture.** Update `docs/ARCHITECTURE.md`: context diagram (Mermaid), modules and dependencies, trust
   boundaries, request lifecycle (auth → tenancy → permission → scope → service → audit), local dev topology
   (Docker Compose: Postgres, MinIO, Mailpit), environments, and the auth design (D-010) with alternatives considered.
9. **Plan.** Update `docs/IMPLEMENTATION_PLAN.md` with phases 0–7 (canonical numbering from MASTER_PROMPT §9), each
   broken into vertical slices (name, goal, acceptance criteria, dependencies, rough size S/M/L).
10. **First slice.** Define Phase 1, Slice 1 precisely: files to create, commands to run, acceptance criteria,
    and what the owner will be able to see when it is done.
11. **Progress.** Write `docs/PROGRESS.md` (current phase = 0 complete pending review, next step = Phase 1 slice 1,
    blockers = decisions list).

## Out of scope

Scaffolding, `create-next-app`, `nest new`, Prisma schema, dependency installation, Docker containers, any UI.

## Decisions to push for now (block Phase 1–2)

D-010 auth approach · D-024 package manager/monorepo · D-035 validation library · D-028 languages · D-034 market,
currency and default timezone · D-015 hosting target (can stay Proposed until Phase 7, but affects CI) · D-038
marketing content policy.

## Exit gate

- [ ] All deliverable docs updated, internally consistent, and free of invented business rules
- [ ] Decisions table has IDs, status, blocking phase and recommended defaults
- [ ] Phase 1 Slice 1 is specified with testable acceptance criteria
- [ ] No application code or dependencies added

## Report format (end of phase)

1. Environment assessment (tool → version → OK/missing → install command)
2. Contradictions/gaps found → proposed resolution
3. Phase plan summary (one line per phase, slice count)
4. Decisions needed from the owner, ordered by urgency (ID, question, recommended default, what it blocks)
5. Phase 1 Slice 1 definition + acceptance criteria
6. Exact commands the owner should run or approve next
7. Files changed

## Change log

- v2.0 — consolidated from MASTER_PROMPT v1 Phase 0 + Supplementary prompt Phase 0 (audit doc folded into
  PRODUCT_REQUIREMENTS/ARCHITECTURE since there is no existing code to audit).
