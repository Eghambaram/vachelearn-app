---
name: isolation-tests
description: Generate cross-tenant and cross-branch negative tests (IDOR, list leakage, filter/cursor/export tampering, cross-tenant references) for a VacheLearn API resource. Use whenever a new tenant-owned resource or endpoint is added.
argument-hint: "[resource name, e.g. courses]"
---

Write isolation tests for resource: $ARGUMENTS

1. Find the resource's controller, service, DTOs and Prisma model. List every endpoint (method + path + permission)
   and every job/export that touches it. Classify the model: tenant-owned, branch-scoped (how is branch derived?),
   or global.
2. Use the shared two-tenant fixture (Tenant A with branches A1, A2; Tenant B with B1; users per role; one user in both
   tenants). Create it first if it does not exist, in `apps/api/test/fixtures/`.
3. For each endpoint generate tests in `apps/api/src/<module>/test/<module>.isolation.spec.ts`:
   - Read by ID of a Tenant B record as a Tenant A user → **404** and no data in the body.
   - List as Tenant A → zero Tenant B rows; with `?tenantId=B` or similar injected params → still zero.
   - Update / delete / state-action on a Tenant B record → **404**, record unchanged (re-read from DB).
   - Create in Tenant A that references a Tenant B ID (course, group, user, branch, template, asset) → 404/422, no
     row created (count before/after).
   - Branch scope (if applicable): A1 branch admin cannot read/list/act on A2 records by ID, by `branchId=A2` filter,
     by a cursor taken from an A2 listing, or by an export ID created by an A2 user.
   - Multi-tenant user: with Tenant A active, cannot see Tenant B data even though they are a member of B.
   - Learner: cannot read another learner's record in the same branch unless the permission matrix allows it.
4. Name each test by behaviour. Assert both status code and absence of leaked fields.
5. Run the new tests and report counts. If any fail, that is a real isolation bug: report it with file:line and fix
   the service/query (not the test).
