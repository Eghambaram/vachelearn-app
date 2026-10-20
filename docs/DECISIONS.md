# Product & Technical Decisions Log

Record each decision with ID, status, the phase it blocks, owner, date, rationale and impact. **Do not silently invent
business rules.** Only the product owner can mark a row **Confirmed**. Never delete rows — mark them
**Superseded by D-NNN** and add a new row. Use the `/decision` skill to edit this file.

Statuses: **Confirmed** · **Proposed** (default Claude builds against until confirmed) · **Needs decision** (no safe
default; ask) · **Superseded**.

_Kit v2.0 prepared 2026-10-20. All rows below are Proposed or Needs decision; none has been Confirmed by the owner yet._

## Architecture & engineering

| ID | Topic | Decision / proposal | Status | Blocks | Owner | Date | Rationale / impact |
|---|---|---|---|---|---|---|---|
| D-001 | Architecture style | Modular monolith with explicit bounded contexts; no microservices | Proposed | P2 | — | 2026-10-20 | Low fixed cost, simpler ops; module boundaries keep a later split possible |
| D-002 | Frontend | Next.js (App Router) + TypeScript, Tailwind, shadcn/ui | Proposed | P1 | — | 2026-10-20 | Mature ecosystem; SSR for public catalog |
| D-003 | Backend | NestJS + TypeScript | Proposed | P2 | — | 2026-10-20 | Modules, guards and DI fit RBAC + tenancy |
| D-005 | Database + ORM | PostgreSQL + Prisma, one ORM only; composite tenant FKs; RLS optional (P7) | Proposed | P2 | — | 2026-10-20 | Relational integrity; Prisma composite relations enforce tenant ownership |
| D-006 | Video hosting | `VideoProvider` adapter; `mock` locally; Cloudflare Stream candidate | Proposed — verify account + cost | P3 | — | 2026-10-20 | Avoid storing video in DB; cost scales with minutes stored/delivered |
| D-009 | File storage | `StorageService`; MinIO locally; S3-compatible prod (AWS S3 or Cloudflare R2) | Proposed | P3 | — | 2026-10-20 | Switchable provider; egress cost favours R2 — decide with D-015 |
| D-010 | Authentication | API-owned email+password (Argon2id), email verification, reset, opaque DB sessions via httpOnly cookie, CSRF protection, rate limits; SSO (SAML/OIDC) via adapter later. Alternatives: Auth.js (web-owned, weaker fit with API authority), managed IdP (Clerk/Auth0: faster, per-MAU cost, data residency), Keycloak (self-hosted ops burden) | Proposed | P2 | — | 2026-10-20 | Revocable sessions are required for deactivation AC; no per-user vendor cost during MVP |
| D-015 | Hosting & deployment | Docker images; host TBD (e.g. a managed container platform + managed Postgres). Consider India region for data residency | Needs decision | P7 (affects CI in P2) | — | — | Cost, region, backups, compliance |
| D-024 | Package manager / repo | pnpm workspaces monorepo; Turborepo only if needed | Proposed | P1 | — | 2026-10-20 | Fast, strict dependency isolation |
| D-028 | Languages / i18n | English only at launch; all strings through i18n helper from day one; Hindi/regional languages later | Proposed — confirm languages | P1 | — | 2026-10-20 | Retrofitting i18n is expensive; legacy supported multiple languages |
| D-031 | Tenant feature modules | Per-tenant feature flags (classroom, surveys, commerce, public catalog, analytics) instead of legacy "editions/modules" tables | Proposed | P2 | — | 2026-10-20 | Matches spec "stage features with flags, not separate architectures" |
| D-035 | API validation library | Choose one in P2: class-validator DTOs (Nest-native, OpenAPI decorators) **or** Zod schemas shared via `packages/contracts` | Proposed — decide at P2 start | P2 | — | — | Consistency; Zod enables shared web/API contracts |
| D-037 | Platform support access | Platform staff access a tenant only via explicit, time-boxed, reason-required, audited "support session"; no silent impersonation | Proposed | P2 | — | 2026-10-20 | Legacy had impersonation; trust + audit requirement |
| D-039 | Primary keys | UUID v7 (time-ordered) generated in app or DB | Proposed | P2 | — | 2026-10-20 | Index locality; non-enumerable |
| D-040 | Background jobs | Postgres-backed job/outbox table; BullMQ/Redis only when measured need | Proposed | P3 | — | 2026-10-20 | Fewer moving parts at MVP |

## Product rules

| ID | Topic | Decision / proposal | Status | Blocks | Owner | Date | Rationale / impact |
|---|---|---|---|---|---|---|---|
| D-004 | Group assignment membership changes | Recommended: members added later receive active group assignments; removed members keep existing enrollments + history; future access configurable | Needs decision | P4 | — | — | Avoids inconsistent outcomes when groups change |
| D-007 | Payment provider & markets | India-first implies INR + evaluating Razorpay, Stripe (India), Cashfree; confirm countries, currencies, settlement | Needs decision | P6 | — | — | Tax, fees, refunds and webhooks differ per provider |
| D-008 | Access after refund | Admin-configurable per offer: revoke or keep access; learning evidence always preserved | Needs decision | P6 | — | — | Payment state ≠ learning history |
| D-011 | Course version migration | Existing enrollments stay on enrolled version unless an admin explicitly migrates them (audited) | Proposed | P3 | — | 2026-10-20 | Reproducible completion evidence |
| D-012 | SCORM / xAPI / AICC / cmi5 | Not in MVP; do not claim support. Legacy stored AICC data and manifest/launch URLs — confirm whether existing SCORM content must play | Needs decision | P3 (content types) | — | — | Large scope; requires conformance testing |
| D-013 | Volume & performance targets | Proposed baseline p95 < 500 ms for common list/detail at agreed MVP load; need expected tenants, learners, concurrency, media volume | Needs decision | P7 | — | — | Sizing, cost, load tests |
| D-014 | Data retention & deletion | Define retention for audit, learning evidence, certificates, PII; learner data export/deletion process; DPDP Act 2023 (India) review by counsel | Needs decision | P5 | — | — | Legal obligations; cannot erase required evidence |
| D-016 | Course completion policy | Per-course: all mandatory lessons + passing required assessment (if any); attendance only when specified | Needs decision (default Proposed) | P4 | — | — | Different training types need different evidence |
| D-017 | Public certificate verification data | Opaque ID; show validity status, course title, issue/expiry date, issuer; learner name only if owner agrees | Proposed | P4 | — | 2026-10-20 | Trust vs privacy |
| D-018 | Compliance due-soon & renewal | Requirement-level due rule, due-soon window (e.g. 30 days) and renewal interval; policy version stored on evidence | Needs decision | P5 | — | — | Auditability; boundary tests |
| D-019 | Classroom waitlist | Off for MVP; capacity hard limit | Proposed | P5 | — | 2026-10-20 | Legacy had waitlists; add only when tested |
| D-020 | Survey anonymity | Explicit anonymous vs identified mode per survey; cannot change after first response | Proposed | P5 | — | 2026-10-20 | Anonymity promises must be technically meaningful |
| D-021 | Public catalog & custom domains | Tenant setting: private / tenant-authenticated / public; subdomain per tenant later; custom domains need DNS + TLS workflow | Needs decision | P3 | — | — | Legacy had per-tenant portals with URLs |
| D-022 | Review before publish | Reference image shows "Under Review"; decide whether a reviewer approval step exists | Needs decision | P3 | — | — | Adds role + state; default: no review step |
| D-023 | Answer-key visibility | Learners see correct answers after submission? after passing? never? Staff see answer keys by permission | Needs decision | P4 | — | — | Assessment integrity vs learning value |
| D-025 | Learning paths / programmes | Legacy had programmes/training plans (ordered courses, mandatory/optional counts, module-level completion). Not in MVP spec; schedule? | Needs decision | P5+ | — | — | Common industrial need; affects completion + compliance model |
| D-026 | Multi-branch learners | Learner in several branches: appears in every branch's reports? primary branch only? | Needs decision | P2 (scope rules) | — | — | Changes branch scoping semantics |
| D-027 | Tenant subscription billing | Reference images show plans, MRR and expiring subscriptions. Is VacheLearn billing tenants in-app (separate from course commerce)? | Needs decision | P6 | — | — | New domain (plans, invoices); hide widgets until decided |
| D-029 | Tax, GST & invoices | Legacy had tax nexus/VAT and discounts. Confirm GST handling, invoice generation, discount codes | Needs decision | P6 | — | — | Legal requirements vary by market |
| D-030 | Legacy "portal" concept | Legacy: tenant → multiple portals (admin/learner sites with own URL/branding). Map to TenantDomain + branding, or support multiple portals per tenant? | Needs decision | P3 | — | — | Affects tenancy model if multiple audiences per tenant |
| D-032 | Assignment due date in past | Recommended: require explicit confirmation, then create as overdue | Needs decision (default Proposed) | P4 | — | — | Spec requires consistent, tested behaviour |
| D-033 | Learner self-registration | Legacy public catalog had Sign Up. Allow self-registration per tenant? With email domain restriction? | Needs decision | P3 | — | — | Security + licensing implications |
| D-034 | Market, currency, default timezone | India-first? Default currency INR, tenant default timezone Asia/Kolkata, multi-timezone branches supported | Needs decision | P1 (formatting) | — | — | Formatting, seed data, payments |
| D-036 | Legacy data migration | Is migration from the legacy LMS in scope? Which tenants, records, history depth? | Needs decision | P7 | — | — | Large effort; exception reports + sign-off |
| D-038 | Marketing content | No third-party logos, testimonials or statistics without written permission and real data; placeholders until supplied | Proposed | P1 | — | 2026-10-20 | Trademark + consumer-protection risk; reference image 10 shows real logos |
| D-041 | Lesson completion rules by type | Proposed: video ≥ 90% watched; document opened + acknowledged; text/link manual "Mark complete"; quiz by pass | Needs decision (default Proposed) | P3 | — | — | Prevents "opened = completed" |
| D-042 | Scoring & rounding | Percentage = points earned / points possible × 100, rounded half-up to 1 decimal; pass if ≥ pass mark | Proposed | P4 | — | 2026-10-20 | Spec requires a documented rounding policy |
| D-043 | Candidate features from legacy | Gamification, ratings/reviews, CEU, skills/proficiency, e-signature, observation checklists, manager approval, external training records, VC integrations, discussions — schedule individually | Needs decision | after R2 | — | — | See `docs/LEGACY_CAPABILITY_INVENTORY.md` |
