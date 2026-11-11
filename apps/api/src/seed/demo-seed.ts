import { randomBytes } from 'node:crypto';
import { MembershipsService } from '../access/memberships.service';
import type { TenantRole } from '../access/permissions';
import { hashPassword } from '../auth/passwords';
import { PrismaService } from '../prisma/prisma.service';

/*
 * Demo seed (Slice 2.6b; .claude/rules/database.md "Seed data"): two obviously fictional tenants, branches in
 * different time zones, one account per tenant role per tenant, one person in both tenants with different roles, a
 * platform admin, and each tenant's job roles. Idempotent: everything is found or created on its business key (slug,
 * branch code, email, job-role name, live role), so a second run changes nothing. Courses and enrollments arrive with
 * their slices (Phases 3–4).
 *
 * Passwords: an account gets one only when it has none — from SEED_PASSWORD, else a random one returned to be printed
 * once. Existing passwords are never changed or printed.
 */

const DOMAIN = 'demo.vachelearn.test';

type TenantSpec = {
  slug: string;
  displayName: string;
  timezone: string;
  industry: 'manufacturing' | 'logistics';
  branches: { code: string; name: string; timezone: string; city: string; countryCode: string }[];
  jobRoles: string[];
};

export const DEMO_TENANTS: readonly TenantSpec[] = [
  {
    slug: 'demo-manufacturing',
    displayName: 'Demo Manufacturing Co',
    timezone: 'Asia/Kolkata',
    industry: 'manufacturing',
    branches: [
      {
        code: 'PUNE',
        name: 'Demo Plant Pune',
        timezone: 'Asia/Kolkata',
        city: 'Pune',
        countryCode: 'IN',
      },
      {
        code: 'HOU',
        name: 'Demo Plant Houston',
        timezone: 'America/Chicago',
        city: 'Houston',
        countryCode: 'US',
      },
    ],
    jobRoles: ['Welder (Demo)', 'Machine operator (Demo)', 'Site supervisor (Demo)'],
  },
  {
    slug: 'demo-logistics',
    displayName: 'Demo Logistics Ltd',
    timezone: 'Europe/London',
    industry: 'logistics',
    branches: [
      {
        code: 'LON',
        name: 'Demo Depot London',
        timezone: 'Europe/London',
        city: 'London',
        countryCode: 'GB',
      },
      {
        code: 'CHE',
        name: 'Demo Depot Chennai',
        timezone: 'Asia/Kolkata',
        city: 'Chennai',
        countryCode: 'IN',
      },
    ],
    jobRoles: ['Forklift driver (Demo)', 'Warehouse lead (Demo)'],
  },
];

/** One account per tenant role per tenant: tenant-wide, or on the first branch where the role is branch-only. */
const ROLES: readonly { role: TenantRole; onBranch: boolean; key: string }[] = [
  { role: 'tenant_admin', onBranch: false, key: 'admin' },
  { role: 'branch_admin', onBranch: true, key: 'branch-admin' },
  { role: 'learning_manager', onBranch: false, key: 'learning-manager' },
  { role: 'compliance_viewer', onBranch: false, key: 'compliance' },
  { role: 'instructor', onBranch: true, key: 'instructor' },
  { role: 'learner', onBranch: true, key: 'learner' },
];

export const seedEmail = (local: string) => `${local}@${DOMAIN}`;

export type SeedResult = {
  /** Accounts that received a password in this run (to print once). Empty on a re-run. */
  newPasswords: string[];
  /** The password set this run (SEED_PASSWORD or generated); null when no account needed one. */
  password: string | null;
  accounts: string[];
};

export async function seedDemo(
  prisma: PrismaService,
  memberships: MembershipsService,
  options: { password?: string } = {},
): Promise<SeedResult> {
  await assertDemoDatabase(prisma);
  const password = options.password ?? randomBytes(12).toString('base64url');
  let passwordHash: string | null = null;
  const newPasswords: string[] = [];
  const accounts: string[] = [];
  const actor = { userId: null, requestId: null, reason: 'db:seed demo data' };

  async function account(local: string, displayName: string) {
    const email = seedEmail(local);
    accounts.push(email);
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, displayName, emailVerifiedAt: new Date() },
      select: { id: true, credential: { select: { userId: true } } },
    });
    if (!user.credential) {
      passwordHash ??= await hashPassword(password);
      await prisma.userCredential.create({
        data: { userId: user.id, passwordHash, changedAt: new Date() },
      });
      newPasswords.push(email);
    }
    return user.id;
  }

  for (const spec of DEMO_TENANTS) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: spec.slug },
      update: {},
      create: {
        slug: spec.slug,
        displayName: spec.displayName,
        defaultTimezone: spec.timezone,
        industry: spec.industry,
        settings: { create: {} },
      },
      select: { id: true },
    });
    const branchIds: string[] = [];
    for (const b of spec.branches) {
      const branch = await prisma.branch.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: b.code } },
        update: {},
        create: { tenantId: tenant.id, ...b },
        select: { id: true },
      });
      branchIds.push(branch.id);
    }
    for (const name of spec.jobRoles) {
      await prisma.jobRole.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name } },
        update: {},
        create: { tenantId: tenant.id, name },
      });
    }
    for (const r of ROLES) {
      const userId = await account(
        `${r.key}.${spec.slug}`,
        `${spec.displayName.split(' ')[1]} ${r.key.replaceAll('-', ' ')} (Demo)`,
      );
      await memberships.operatorGrantTenantRole(
        { userId, tenantId: tenant.id, role: r.role, branchId: r.onBranch ? branchIds[0]! : null },
        actor,
      );
    }
    // A second learner on the second branch, so branch scope is visible in the demo.
    const second = await account(
      `learner2.${spec.slug}`,
      `${spec.displayName.split(' ')[1]} learner two (Demo)`,
    );
    await memberships.operatorGrantTenantRole(
      { userId: second, tenantId: tenant.id, role: 'learner', branchId: branchIds[1]! },
      actor,
    );
  }

  // One person in both tenants, with different roles (rules: a multi-tenant user).
  const [manufacturing, logistics] = await Promise.all(
    DEMO_TENANTS.map((t) =>
      prisma.tenant.findUniqueOrThrow({ where: { slug: t.slug }, select: { id: true } }),
    ),
  );
  const both = await account('both-tenants', 'Asha Both-Tenants (Demo)');
  await memberships.operatorGrantTenantRole(
    { userId: both, tenantId: manufacturing!.id, role: 'learning_manager', branchId: null },
    actor,
  );
  const chennai = await prisma.branch.findFirstOrThrow({
    where: { tenantId: logistics!.id, code: 'CHE' },
    select: { id: true },
  });
  await memberships.operatorGrantTenantRole(
    { userId: both, tenantId: logistics!.id, role: 'learner', branchId: chennai.id },
    actor,
  );

  // A platform admin (D-037: platform staff reach tenants only through support sessions).
  const staff = await account('platform-admin', 'Platform Admin (Demo)');
  await memberships.operatorGrantPlatformRole(
    { userId: staff, role: 'platform_super_admin' },
    actor,
  );

  return { newPasswords, password: newPasswords.length > 0 ? password : null, accounts };
}

/**
 * Asks the server which database this is: only the local dev database or a `_test` one may be seeded (the URL guard in
 * scripts/ checks the host; this catches a CLI run directly, or a URL that points elsewhere than it says).
 */
async function assertDemoDatabase(prisma: PrismaService) {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing to seed: NODE_ENV is production.');
  const [row] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  const name = row?.name ?? '';
  if (name !== 'vachelearn' && !name.endsWith('_test')) {
    throw new Error(
      `Refusing to seed database "${name}": only the local dev database or a _test database.`,
    );
  }
  if (name.endsWith('_test')) return;
  // The dev database may hold only demo data: a database with real tenants or people is never seeded — not even one
  // reached through a tunnel under the same name (isolation review 2.6b).
  const tenants = await prisma.tenant.findMany({ select: { slug: true } });
  const users = await prisma.user.findMany({ select: { email: true } });
  const problem = demoFenceProblem(
    tenants.map((t) => t.slug),
    users.map((u) => u.email),
  );
  if (problem) throw new Error(`Refusing to seed database "${name}": ${problem}`);
}

/**
 * Why a database is not a demo database, or null: every tenant must be a demo tenant and every account on the reserved
 * `.test` domain (accounts made by hand for local testing use it too).
 */
export function demoFenceProblem(
  slugs: readonly string[],
  emails: readonly string[],
): string | null {
  const demo = new Set(DEMO_TENANTS.map((t) => t.slug));
  const tenant = slugs.find((slug) => !demo.has(slug));
  if (tenant) return `it holds a tenant that is not demo data (${tenant}).`;
  if (emails.some((email) => !email.endsWith('.test'))) {
    return 'it holds an account outside the reserved .test domain.';
  }
  return null;
}
