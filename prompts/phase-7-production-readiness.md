# Phase 7 — Production readiness

**Exit:** go/no-go checklist signed by the owner with evidence for each line.

## Message to send

```text
Start Phase 7 from prompts/phase-7-production-readiness.md. Produce the readiness checklist first with current
evidence status for every item, then work through the gaps one slice at a time. Do not touch any real production
environment or secret without my explicit go-ahead in this chat.
```

## Slices

### 7.1 Security review
Run `security-reviewer` across the codebase; threat model (STRIDE-lite) per trust boundary in `docs/SECURITY.md`;
dependency audit; secret scanning in CI; security headers/CSP; rate limits; session settings; upload scanning;
optional RLS (see `.claude/rules/database.md`) with tests; audit log DB permissions.
**AC:** no open critical/high findings for tenant isolation, privilege escalation, payment or certificate integrity.

### 7.2 Accessibility
Keyboard-only and screen-reader passes on primary admin + learner journeys, axe on all primary screens, contrast
re-check, documented exceptions in `docs/ACCESSIBILITY.md`. Do not claim WCAG conformance without this evidence.

### 7.3 Performance
Agree numeric targets (D-013); seed representative volume; load test common list/detail endpoints, dashboard, export
jobs; add indexes/pagination fixes; record results.

### 7.4 Operations
Deployment pipeline to staging/production (D-015), migrations in deploy with rollback/forward-fix notes, error tracking,
alerts, backups + **executed** restore test in non-production, runbook (incidents, request-ID lookup, audit lookup,
escalation contacts), status of every env var in `.env.example`.

### 7.5 Legacy migration rehearsal (only if D-036 Confirmed)
Profile legacy data, mapping in `docs/MIGRATION_MAPPING.md`, dry-run import, exception reports (orphans, duplicates,
invalid ownership, inconsistent completions, certificates without evidence), reconciliation with sampled records,
owner sign-off. Never import legacy password hashes without a reviewed plan; prefer forced reset.

### 7.6 Release checklist
Spec §21 + Appendix A turned into `docs/RELEASE_CHECKLIST.md` with evidence links; known limitations; support docs.

## Exit gate

Owner signs the checklist; `qa-verifier` confirms all gates from a clean clone; staging smoke test passes.

## Change log

- v2.0 — from MASTER_PROMPT v1 Phase 7 / spec sprint 6.
