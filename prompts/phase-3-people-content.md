# Phase 3 — People & course content (Release R2, part 1)

**Exit:** a tenant admin invites people, organises groups, authors and publishes a versioned course with assets; an
authorized learner can discover it in the catalog; unauthorized users cannot.

## Message to send

```text
Start Phase 3 from prompts/phase-3-people-content.md. Check D-004, D-009, D-011, D-021, D-022 and D-033 in
DECISIONS.md and ask me about any still blocking. Plan Slice 3.1, then implement.
```

## Read first

Spec §5 (invitations, groups, import), §6 (catalog, authoring) · `docs/ACCEPTANCE_TESTS.md` "Invitations and roles",
"Courses and versioning" · UI refs 02, 07 · `docs/LEGACY_CAPABILITY_INVENTORY.md` §People, §Learning content.

## Slices

### 3.1 Invitations
Create (role + branch/group within actor's authority), list, resend, revoke; email via `EmailProvider` (Mailpit
locally) through the outbox; accept flow for new and existing accounts; token hash only; expiry; bound to email +
tenant. Web: invite dialog, invitations table, accept page.
**AC:** accept once; replay → error; expired → error; different email/tenant → error; existing account gains only the
invited membership; invite link never logged; all actions audited.

### 3.2 Groups
CRUD, optional branch/department scope, manual membership, member list with scope enforcement.
**AC:** branch admin can only manage groups and members within their branches; removing a member preserves history.

### 3.3 Categories, tags, course drafts
Category/Tag management; Course + draft CourseVersion; metadata form (builder step 1) with optimistic concurrency.
**AC:** drafts visible only to content managers; concurrent edit → 409 with reload path.

### 3.4 Storage + assets
`StorageService` (MinIO), upload flow with content sniffing + size limits, non-guessable keys, signed URL issuance
after authorization; thumbnail and document assets; `VideoProvider` interface with `mock` implementation (upload →
processing → ready states).
**AC:** another tenant cannot obtain a signed URL for an asset (isolation test); disallowed type rejected; signed URLs
never logged.

### 3.5 Content builder
Modules and lessons (text, video, document, link, quiz placeholder linking to Phase 4 assessment), ordering (drag +
keyboard), lesson completion rule per type (e.g. video ≥ X% watched, document opened + acknowledge, text manual
complete) — defaults recorded as decisions.
**AC:** reorder persists and is reflected in preview order; broken asset shows recoverable error in preview.

### 3.6 Publish + versioning + archive
Validation (metadata, ≥1 valid item, visibility, completion policy), publish creates immutable version (number,
publisher, time), edit-after-publish creates new draft, archive blocks new enrollment. Review step only if D-022 says so.
**AC:** published version cannot be mutated by any endpoint (API test tries each); version numbers stable; audited.

### 3.7 Catalog
Tenant catalog (authenticated) with search/filters (category, level, format, language, duration), course detail page;
public catalog only if D-021 enables it, exposing only public courses' marketing fields.
**AC:** learners see only entitled courses; internal courses never appear publicly; filters + pagination bounded.

## Exit gate

Isolation specs for invitations, groups, courses, versions, assets, catalog · e2e: invite → accept → admin publishes
v1 → learner sees it · docs updated · `qa-verifier` pass.

## Change log

- v2.0 — from MASTER_PROMPT v1 Phase 3 / spec sprint 2.
