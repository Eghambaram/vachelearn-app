---
paths:
  - "docs/**"
  - "prompts/**"
  - "MASTER_PROMPT.md"
  - "README.md"
---

# Documentation rules

- `docs/` describes what **is** (or is explicitly **Proposed**), never what we wish existed. If code and docs disagree,
  fix the doc in the same change or flag the discrepancy.
- `docs/DECISIONS.md`: every row has ID (`D-NNN`), topic, decision/proposal, status (**Confirmed** / **Proposed** /
  **Needs decision** / **Superseded by D-NNN**), owner, date (YYYY-MM-DD), rationale, impact. Never delete rows; supersede
  them. Only the product owner moves a row to Confirmed — record who and when.
- `docs/PROGRESS.md` stays short (target < 80 lines): current phase, current slice, last verified gate results, next
  step, blockers. Move finished-slice detail to `docs/progress-log/YYYY-MM.md`. It is imported into every session, so
  every line costs context.
- `docs/ROLE_PERMISSION_MATRIX.md` must match `apps/api/src/access/permissions.ts`. Update both together.
- `docs/DOMAIN_MODEL.md` lists every model as global / tenant-owned / branch-scoped, its lifecycle states and
  transitions, and its immutability rules.
- `docs/API_SPECIFICATION.md` links to generated OpenAPI and documents conventions + non-obvious behaviours
  (idempotency, error codes). Do not hand-maintain endpoint lists that OpenAPI already generates.
- `docs/METRICS.md` (Phase 5–6): each metric's numerator, denominator, filters, exclusions, time window, timezone,
  refresh expectation, and source query location.
- `docs/RUNBOOK.md`: exact commands that were actually run, not aspirational ones.
- Prompts in `prompts/` are instructions to Claude; if a phase's plan changes, update its prompt and note why at the
  bottom ("Change log").
