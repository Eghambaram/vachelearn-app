# VacheLearn API — conventions

The endpoint list is generated from code: OpenAPI at `/api/docs` (UI) and `/api/docs-json` (JSON) in every
environment except production. This document records the conventions and non-obvious behaviours that OpenAPI does not
show. Request and response shapes are the shared Zod schemas in `packages/contracts` (D-035), validated on the server
by `ZodValidationPipe` and turned into OpenAPI by Zod's built-in JSON Schema output (D-077).

Status: established in Phase 2 Slice 2.1 (2026-10-27). Endpoints are added slice by slice.

## Base paths

| Path | Purpose |
|---|---|
| `/api/v1/**` | Every API route |
| `/health` | Liveness: the process is up. Always 200 `{ "status": "ok" }` |
| `/ready` | Readiness: the database answers within 2 s. 200 `{ "status": "ready", "checks": { "database": "up" } }`, otherwise 503 `NOT_READY` |
| `/api/docs`, `/api/docs-json` | OpenAPI, development only by default (see below); 404 in production |

## Errors

Every non-2xx response is the envelope (contract `ApiErrorBody`):

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Invalid request", "requestId": "req_…",
             "fieldErrors": [{ "field": "name", "code": "too_small", "message": "…" }] } }
```

| Status | Code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed request (e.g. invalid JSON) |
| 401 | `UNAUTHENTICATED` | No valid session (from Slice 2.3) |
| 403 | `FORBIDDEN` | Signed in, not permitted |
| 404 | `NOT_FOUND` | Missing **or hidden by tenant/branch scope** — same response, so existence never leaks |
| 409 | `CONFLICT` | State conflict (e.g. optimistic-concurrency version mismatch) |
| 422 | `VALIDATION_FAILED` | Params, query or body fail the contract; one `fieldErrors` entry per problem. Unknown fields are rejected (`code: "unrecognized_keys"`, `field: "(root)"`) — a client can never send `tenantId` or other server-owned fields |
| 429 | `RATE_LIMITED` | Rate limit hit (from Slice 2.3) |
| 500 | `INTERNAL` | Unexpected error. Message is always "Internal error"; details and stack go to the server log only |
| 503 | `NOT_READY` | `/ready` while a dependency is unavailable |

Framework errors use fixed messages (never the framework's wording or echoed input).

## Authorization (deny by default)

Every route is `@Public()` (`/health`, `/ready`, `POST /auth/login`), `@Authenticated()` (any signed-in caller, for
their own session: `/auth/me`, `/auth/logout`) or names the permission it needs. No signed-in caller → 401; signed in
without the permission → 403; a record outside the caller's tenant or branch scope → 404. Platform routes
(`/api/v1/platform/**`) take platform permissions only — tenant roles never pass, and platform roles never imply
tenant access (D-037). Until roles and memberships exist (Slice 2.4), a signed-in user holds no permission, so
permission routes answer 403.
A declared permission always wins over `@Public()`, and a route test (`test/routes.isolation.test.ts`) fails when a
handler declares both or neither, or when a `platform/**` route names a tenant permission (or the reverse).

## Sessions and cross-site protection (Slice 2.3b)

- The browser calls the API through the web app's origin (`/api/v1/*` proxied by Next.js, D-085). Sign-in sets
  `__Host-vl_session` (HttpOnly, Secure, SameSite=Lax, Path=/, expires with the session): 32 random bytes; the database
  stores only their SHA-256. Sessions end after 8 hours idle or 7 days (D-084), and on the next request after the user
  is deactivated (D-049); the end reason is recorded.
- `POST /auth/login` `{ email, password }` → 200 `AuthSessionView` `{ user, csrfToken, expiresAt }`. Every failure
  (unknown email, wrong password, no password yet, unverified, deactivated) is the same 401 `INVALID_CREDENTIALS` after
  one Argon2id verification; a failure is logged as `auth.sign_in_failed` with a keyed hash, never the address. Rate
  limits (D-086, Proposed): 10 attempts per account (by user id when the address exists, so case variants share it)
  and 50 per client IP (IPv6 per /64) per 15 minutes → 429 `RATE_LIMITED` with `Retry-After`; keys are HMACs. At most
  2 hashes run at once with 32 waiting, beyond that 503 `BUSY` with `Retry-After`. Bodies over 4 KB on `/auth/*` → 413.
  Signing in from a browser that already holds a session ends that session.
- `GET /auth/me` → `AuthSessionView`; `POST /auth/logout` → 204 and the cookie is cleared.
- Every POST/PUT/PATCH/DELETE must come from the web origin (`Origin` equal to `WEB_ORIGIN`, or `Sec-Fetch-Site:
  same-origin` when a browser sends no `Origin`); otherwise 403 `CROSS_ORIGIN`. A session-authenticated mutation also
  needs `x-csrf-token` equal to its session's token (HMAC of the session id with `SESSION_SECRET`) → else 403 `CSRF`.
  A mutation with a body must send `application/json` → else 415 `UNSUPPORTED_MEDIA_TYPE` (HTML forms cannot).
  Deviation from the 2.1 review's "no-Origin mutations refused": `Sec-Fetch-Site: same-origin` is accepted in place
  of `Origin` (browsers cannot forge it). Future signature-verified webhooks will need an explicit exemption.
- Client IP (rate limits) honours exactly `TRUST_PROXY_HOPS` proxies (required in production). The web app's
  `/api/v1` proxy forwards the client's `X-Forwarded-For` unchanged and appends nothing (checked 2026-10-28), so the
  count is the number of proxies **in front of the web app** that append the client address: 0 locally, at least 1
  in production (refused otherwise — with 0 every user would share the web server's address). Both the API and the
  web app must be reachable only through that appending proxy, or clients choose their own IP. Responses carry
  `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy: no-referrer`, `Cache-Control: no-store` (helmet); HSTS in production only. `/api/docs` (never in
  production) has its own CSP so Swagger UI loads.

## Memberships and the active tenant (Slice 2.4a)

- A session works in one tenant: its **active membership** (D-089), never a header, URL, slug or body. One usable
  membership → selected at sign-in (and on the next request if it appears later); several → `activeTenant` is null
  until the user chooses. `AuthSessionView.activeTenant` = `{ membershipId, tenantId, slug, displayName }` or null.
- `GET /me/memberships` → `{ data: MembershipSummary[] }`: the caller's active memberships in active or suspended
  tenants, with live roles (and their branch) and which one is active.
- `POST /auth/session/tenant` `{ membershipId }` → `AuthSessionView`: switch to one of the caller's own memberships
  (audited `auth.tenant_switched`). Someone else's, inactive or unknown membership → 404; suspended or archived tenant →
  403 `TENANT_SUSPENDED` / `TENANT_ARCHIVED`.
- Tenant routes: no active tenant or no grant → 403; active tenant suspended/archived → 403 `TENANT_SUSPENDED` /
  `TENANT_ARCHIVED` (the account itself still works). Revoked roles, deactivated memberships, deactivated branches
  (D-090, Proposed) and tenant status apply on the next request (D-049). Platform roles reach platform routes only
  (D-037). Automatic selection is audited `auth.tenant_selected`; a switch records the previous membership.

## Role assignments (Slice 2.4b)

- `GET /role-assignments?membershipId=…`, `POST /role-assignments` `{ membershipId, role, branchId | null }` → 201,
  `POST /role-assignments/:id/revoke` `{ reason }` → 200 — all need `role.assign`, all audited (`role.assigned`,
  `role.revoked`, `membership.branch_added`, `membership.primary_branch_set`).
- Tenant Admin: any tenant role, tenant-wide or on an active branch; a member not yet in that branch is added to it
  (D-093); other Tenant Admins too (D-094). Branch Admin: Learner or Instructor only, on its own branches only, for
  members already in one of them; it sees and revokes only assignments on its branches.
- Nobody changes their own roles (403 `SELF_CHANGE`); the last usable Tenant Admin (D-095) cannot be revoked (409
  `LAST_TENANT_ADMIN`, D-091). Every change runs under a per-tenant lock and re-reads the actor's own live roles, so an
  actor revoked a moment ago gets 403. Deactivated or platform-staff accounts get no roles (409 `INVALID_STATE`,
  D-095); duplicate (also when sent twice at once) → 409 `ALREADY_ASSIGNED`; Tenant
  Admin on a branch / Branch Admin without one → 422; another tenant's or out-of-reach membership, branch or
  assignment → 404. Changes apply to the holder on the next request.
- `POST /platform/tenants/:id/first-admin` `{ email, displayName }` (platform, `tenant.update`) → 201
  `{ userId, membershipId, assignmentId, accountCreated }` (D-092): creates the account if needed (set-password email),
  the membership and a whole-tenant Tenant Admin; 409 `TENANT_HAS_ADMIN` once the tenant has a usable one (D-095: an
  admin who never set a password does not count); never the caller's own or any platform staff account (one generic
  409 `INVALID_STATE`); reusing an existing account is audited (`accountReused`).

## Password links (Slice 2.3c)

- Accounts start without a password (D-083): `pnpm --filter api user:create --email … --name … --reason …` creates one and sends
  its set-password email (invitations reuse this in Phase 3). Links are single-use, minted when the email is sent
  (only the SHA-256 is stored, D-081), carry the token in the URL **fragment** (`/set-password#token=…`,
  `/reset-password#token=…`) so it never reaches a server log or `Referer`, and expire after 7 days (set) or
  30 minutes (reset) (D-087). A newer link of the same kind revokes the older one.
- `POST /auth/password/forgot` `{ email }` → always 202, empty body (no account enumeration). Active account with a
  password → reset link; without one yet → a fresh set-password link; unknown or deactivated → nothing. The account
  lookup runs after the 202 is sent, so response time does not reveal registered addresses. Limits
  (D-086, Proposed): 3 per account and 20 per IP per hour → 429, the same for known and unknown addresses.
- `POST /auth/password/set` `{ token, password }` → 204. Policy problems → 422 on `password` (`too_short`,
  `too_long`, `too_common`; the link stays usable). Unknown, used, revoked or expired link, or a deactivated account →
  400 `INVALID_LINK`. Success sets the password, verifies the address, revokes the user's other links and ends every
  session (D-049); the user then signs in. 30 attempts per IP per 15 minutes. A set-password link is refused once the
  account has a password. Minting, consuming and the email's delivery record run under the user's row lock and in
  the delivery transaction (D-081); each send attempt has its own Message-ID, because a resend carries a new link.

## Tenancy (Slice 2.2)

- Platform: `POST /platform/tenants` (duplicate slug → 422 `fieldErrors: [{ field: "slug", code: "taken" }]`),
  `GET /platform/tenants` (cursor list: `status`, `search`, `sort=createdAt|displayName`, `direction`), `GET` /
  `PATCH /platform/tenants/:id`, `POST /platform/tenants/:id/suspend|reactivate|archive` with `{ "reason" }`.
- Tenant: `GET /branches` (cursor list: `status`, `search`, `sort=name|code|createdAt`), `POST /branches`,
  `GET` / `PATCH /branches/:id`, `POST /branches/:id/deactivate|reactivate` with `{ "reason" }`. No tenant id
  anywhere: the tenant is the caller's.
- Edits carry the `version` they read: a stale version is 409 `CONFLICT` and nothing changes. Invalid lifecycle
  transitions are 409 `INVALID_STATE`; archived tenants are final and cannot be edited either (D-080, Proposed).
  The tenant slug cannot be changed (D-079).
- `POST /branches` needs `branch.create` **and** tenant-wide scope: a branch-scoped caller gets 403 even with the
  permission (they could never see the new branch). Updates and lifecycle actions re-apply the caller's branch scope
  in the write itself.
- Cursors are opaque, HMAC-signed with `CURSOR_SECRET` (required in production; random per process elsewhere) and
  bound to the query and the caller's scope: a forged, altered or malformed cursor, or one reused with other filters,
  another tenant or another scope, is 422 (`field: "cursor"`), never a 500. They hold a sort value and an id, never
  personal data. Malformed ids are 404, like missing ones.
- Every change writes an `audit_events` row in the same transaction (actor, tenant, branch, action, reason,
  request id, changed fields before/after). Personal fields (the tenant contact email) are recorded as
  `"[changed]"`, never by value, because audit rows can never be erased. A stale `version` fails before the diff.

## Request IDs

Every response carries `x-request-id` (`req_<uuid>`), and every error envelope and log line carries the same value.
The ID is always generated by the API, so a client cannot reuse another request's ID to confuse correlation or support
lookups. A client's own `x-request-id`, if it is 8–64 characters of `[A-Za-z0-9._-]`, is logged as `clientRequestId`
only.

## CORS

Only the web origin (`WEB_ORIGIN`) receives CORS headers, with credentials (the session cookie from Slice 2.3). Other
origins get no `Access-Control-Allow-Origin` at all.

## Logging

Structured JSON (pino) with the request ID. Request headers are logged from an allowlist only (`user-agent`,
`content-type`, `content-length`, `origin`) — never `Authorization`, `Cookie`, `Referer`, API keys or signatures.
Credential-like fields (`password`, `token`, `secret`, `inviteToken`, `signedUrl`, `answers`…) are redacted at any of
the first three levels. Errors are logged as type, code, message and stack only, with connection-string credentials
and `key=value` secrets scrubbed — never other error properties or `cause`. Request bodies are never logged; URLs are
logged without their query string. Successful `/health` and `/ready` probes are not logged.

## OpenAPI

Served at `/api/docs` when `ENABLE_API_DOCS=true`, or by default when `NODE_ENV=development`. Never in production
(configuration refuses it). `NODE_ENV` has no default, so a misconfigured deploy cannot fall back to development.
