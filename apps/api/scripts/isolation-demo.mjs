// Two-tenant isolation demo (Phase 2 exit gate, docs/RUNBOOK.md "Two-tenant isolation demo").
//
// Signs in as seeded demo accounts against a LOCAL API and shows, call by call, that one tenant cannot read or change
// another tenant's data and that a branch admin cannot reach another branch — whatever ID, filter, header or query
// parameter the client sends. Read-only except for write attempts that must be refused (nothing is changed).
// The automated proof is the isolation suite (`pnpm --filter api test:isolation`); this script is the human-readable
// demonstration of the same rules on the `db:seed` data.
//
// Usage: DEMO_PASSWORD=<demo accounts' password> node scripts/isolation-demo.mjs
//   API_URL (default http://localhost:4000) must be localhost; WEB_ORIGIN (default http://localhost:3000) must match
//   the API's WEB_ORIGIN, because the API refuses state-changing calls from any other Origin.

const API = process.env.API_URL ?? 'http://localhost:4000';
const ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
const PASSWORD = process.env.DEMO_PASSWORD;
const DOMAIN = 'demo.vachelearn.test';

if (!['localhost', '127.0.0.1'].includes(new URL(API).hostname)) {
  console.error('Refusing: API_URL must be a local API (this demo signs in with demo accounts).');
  process.exit(2);
}
if (!PASSWORD) {
  console.error('Set DEMO_PASSWORD to the demo accounts’ password (see RUNBOOK "Demo data").');
  process.exit(2);
}

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

async function signIn(local) {
  const email = `${local}@${DOMAIN}`;
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (res.status !== 200) throw new Error(`sign-in failed for ${email}: HTTP ${res.status}`);
  const body = await res.json();
  // The session cookie is `__Host-` (Secure); pass it on by hand rather than through a cookie jar.
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const call = async (method, path, { json, headers = {} } = {}) => {
    const r = await fetch(`${API}/api/v1${path}`, {
      method,
      headers: {
        cookie,
        origin: ORIGIN,
        'x-csrf-token': body.csrfToken,
        ...(json ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: json ? JSON.stringify(json) : undefined,
    });
    const text = await r.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: r.status, data };
  };
  return { email, activeTenant: body.activeTenant, call };
}

const tenantOf = (email) => (email.match(/\.(demo-[a-z]+)@/) ?? [])[1] ?? 'none';

console.log(`API ${API} · Origin ${ORIGIN}\n`);

// ── 1. Tenant A cannot see or touch tenant B ──────────────────────────────────────────────────────────────────────
console.log('1. Cross-tenant: Demo Manufacturing admin vs Demo Logistics');
const mfgAdmin = await signIn('admin.demo-manufacturing');
const logAdmin = await signIn('admin.demo-logistics');
check(
  'manufacturing admin is in Demo Manufacturing Co',
  mfgAdmin.activeTenant?.slug === 'demo-manufacturing',
);

const mfgPeople = await mfgAdmin.call('GET', '/people?limit=100');
const mfgEmails = (mfgPeople.data?.data ?? []).map((p) => p.email);
check(
  'people list holds no Demo Logistics member',
  mfgPeople.status === 200 &&
    mfgEmails.length > 0 &&
    !mfgEmails.some((e) => tenantOf(e) === 'demo-logistics'),
  `${mfgEmails.length} people, tenants: ${[...new Set(mfgEmails.map(tenantOf))].join(', ')}`,
);

const logPeople = await logAdmin.call('GET', '/people?limit=100');
const logLearner = (logPeople.data?.data ?? []).find((p) =>
  p.email.startsWith('learner.demo-logistics'),
);
const logBranches = await logAdmin.call('GET', '/branches?limit=100');
const london = (logBranches.data?.data ?? []).find((b) => b.code === 'LON');
if (!logLearner || !london)
  throw new Error('demo data missing: run `pnpm --filter api db:seed` first');

// Controls: the same ids resolve for their own tenant, so every 404 below is isolation, not a bad id.
let r = await logAdmin.call('GET', `/people/${logLearner.membershipId}`);
check(
  'control: the Logistics admin reads their own learner → 200',
  r.status === 200,
  `HTTP ${r.status}`,
);
r = await logAdmin.call('GET', `/branches/${london.id}`);
check(
  'control: the Logistics admin reads their London branch → 200',
  r.status === 200,
  `HTTP ${r.status}`,
);

r = await mfgAdmin.call('GET', `/people/${logLearner.membershipId}`);
check(
  'reading a Logistics member by id → 404 (existence not revealed)',
  r.status === 404,
  `HTTP ${r.status}`,
);
r = await mfgAdmin.call('GET', `/branches/${london.id}`);
check('reading a Logistics branch by id → 404', r.status === 404, `HTTP ${r.status}`);
r = await mfgAdmin.call('POST', `/people/${logLearner.membershipId}/deactivate`, {
  json: { reason: 'isolation demo: must be refused' },
});
check(
  'deactivating a Logistics member → 404, nothing changed',
  r.status === 404,
  `HTTP ${r.status}`,
);
r = await mfgAdmin.call('GET', `/people?limit=100&branchId=${london.id}`);
check(
  'filtering people by a Logistics branch id lists nobody',
  r.status === 200 && (r.data?.data ?? []).length === 0,
  `HTTP ${r.status}, ${(r.data?.data ?? []).length} people`,
);
r = await mfgAdmin.call('GET', `/people?limit=100&tenantId=${logAdmin.activeTenant.tenantId}`);
check(
  'a client-supplied tenantId query parameter is rejected',
  r.status === 422,
  `HTTP ${r.status}`,
);
r = await mfgAdmin.call('GET', '/people?limit=100', {
  headers: { 'x-tenant-id': logAdmin.activeTenant.tenantId, 'x-tenant-slug': 'demo-logistics' },
});
check(
  'tenant headers are ignored: still only Demo Manufacturing people',
  r.status === 200 && !(r.data?.data ?? []).some((p) => tenantOf(p.email) === 'demo-logistics'),
  `HTTP ${r.status}`,
);
r = await mfgAdmin.call('POST', '/auth/session/tenant', {
  json: { membershipId: logAdmin.activeTenant.membershipId },
});
check(
  'switching into Logistics with someone else’s membership id is refused',
  r.status === 404 || r.status === 403,
  `HTTP ${r.status}`,
);
r = await mfgAdmin.call('GET', '/audit-events?limit=100');
const logIds = new Set([logLearner.membershipId, london.id, logAdmin.activeTenant.tenantId]);
check(
  'audit log shows no Logistics record',
  r.status === 200 && !(r.data?.data ?? []).some((e) => logIds.has(e.entityId)),
  `HTTP ${r.status}, ${(r.data?.data ?? []).length} events`,
);

// ── 2. A branch admin stays inside their branch ───────────────────────────────────────────────────────────────────
console.log('\n2. Cross-branch: Demo Plant Pune branch admin vs Demo Plant Houston');
const puneAdmin = await signIn('branch-admin.demo-manufacturing');
const mfgBranches = await mfgAdmin.call('GET', '/branches?limit=100');
const houston = (mfgBranches.data?.data ?? []).find((b) => b.code === 'HOU');
const houstonLearner = (mfgPeople.data?.data ?? []).find((p) =>
  p.email.startsWith('learner2.demo-manufacturing'),
);
if (!houston || !houstonLearner)
  throw new Error('demo data missing: run `pnpm --filter api db:seed` first');

r = await mfgAdmin.call('GET', `/people/${houstonLearner.membershipId}`);
check(
  'control: the tenant admin reads the Houston learner → 200',
  r.status === 200,
  `HTTP ${r.status}`,
);
r = await mfgAdmin.call('GET', `/branches/${houston.id}`);
check(
  'control: the tenant admin reads the Houston branch → 200',
  r.status === 200,
  `HTTP ${r.status}`,
);

r = await puneAdmin.call('GET', '/people?limit=100');
const punePeople = r.data?.data ?? [];
check(
  'people list holds only members of Demo Plant Pune',
  r.status === 200 &&
    punePeople.length > 0 &&
    punePeople.every((p) => p.branches.length > 0 && p.branches.every((b) => b.code === 'PUNE')),
  `${punePeople.length} people: ${punePeople.map((p) => p.email.split('@')[0]).join(', ')}`,
);
r = await puneAdmin.call('GET', `/people?limit=100&branchId=${houston.id}`);
check(
  'filtering by the Houston branch id lists nobody (a filter narrows, never widens)',
  r.status === 200 && (r.data?.data ?? []).length === 0,
  `HTTP ${r.status}, ${(r.data?.data ?? []).length} people`,
);
r = await puneAdmin.call('GET', `/people/${houstonLearner.membershipId}`);
check('reading the Houston learner by id → 404', r.status === 404, `HTTP ${r.status}`);
r = await puneAdmin.call('GET', `/branches/${houston.id}`);
check('reading the Houston branch by id → 404', r.status === 404, `HTTP ${r.status}`);
r = await puneAdmin.call('POST', '/role-assignments', {
  json: { membershipId: houstonLearner.membershipId, role: 'instructor', branchId: houston.id },
});
check(
  'granting a role in Houston is refused, nothing changed',
  r.status === 404 || r.status === 403,
  `HTTP ${r.status}`,
);

// ── 3. One person in two tenants sees one tenant at a time ────────────────────────────────────────────────────────
console.log(
  '\n3. Multi-tenant person: Learning Manager in Manufacturing, Learner (Chennai) in Logistics',
);
const both = await signIn('both-tenants');
r = await both.call('GET', '/me/memberships');
const memberships = r.data?.data ?? [];
const logMembership = memberships.find((m) => m.tenant.slug === 'demo-logistics');
const mfgMembership = memberships.find((m) => m.tenant.slug === 'demo-manufacturing');
check(
  'has two memberships, one per tenant',
  memberships.length === 2 && Boolean(logMembership && mfgMembership),
  `HTTP ${r.status}`,
);
r = await both.call('POST', '/auth/session/tenant', {
  json: { membershipId: mfgMembership?.membershipId },
});
check(
  'switches into Demo Manufacturing',
  r.status === 200 && r.data?.activeTenant?.slug === 'demo-manufacturing',
  `HTTP ${r.status}`,
);
r = await both.call('GET', '/people?limit=100');
check(
  'as Manufacturing Learning Manager: sees Manufacturing people only',
  r.status === 200 && !(r.data?.data ?? []).some((p) => tenantOf(p.email) === 'demo-logistics'),
  `HTTP ${r.status}, ${(r.data?.data ?? []).length} people`,
);
r = await both.call('POST', '/auth/session/tenant', {
  json: { membershipId: logMembership?.membershipId },
});
check(
  'switches into Demo Logistics',
  r.status === 200 && r.data?.activeTenant?.slug === 'demo-logistics',
  `HTTP ${r.status}`,
);
r = await both.call('GET', '/people?limit=100');
check('as Logistics Learner: the people list is forbidden', r.status === 403, `HTTP ${r.status}`);
r = await both.call('GET', `/people/${houstonLearner.membershipId}`);
check(
  'a Manufacturing member is unreachable while Logistics is active',
  r.status === 404 || r.status === 403,
  `HTTP ${r.status}`,
);

// ── 4. Platform staff reach tenant data only through a support session ────────────────────────────────────────────
console.log('\n4. Platform admin without a support session');
const staff = await signIn('platform-admin');
r = await staff.call('GET', '/people?limit=100');
check(
  'tenant people list is not available (D-037: support session needed)',
  r.status === 403 || r.status === 404,
  `HTTP ${r.status}`,
);
r = await staff.call('GET', `/people/${logLearner.membershipId}`);
check(
  'a tenant member by id is not available',
  r.status === 403 || r.status === 404,
  `HTTP ${r.status}`,
);

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
