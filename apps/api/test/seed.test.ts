import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '../generated/prisma/client';
import { refuseUnlessLocalDatabase } from '../scripts/database-guard.mjs';
import { MembershipsService } from '../src/access/memberships.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { DEMO_TENANTS, demoFenceProblem, seedDemo, seedEmail } from '../src/seed/demo-seed';
import { createTestApp } from './app';
import { resetDatabase, testPrisma } from './db';

/*
 * db:seed (Slice 2.6b; .claude/rules/database.md): demo-only, idempotent, refuses production and non-local databases;
 * fictional names; passwords set only for new accounts.
 */

vi.setConfig({ hookTimeout: 60_000, testTimeout: 120_000 });

let app: INestApplication;
let db: PrismaClient;
const run = (password?: string) =>
  seedDemo(app.get(PrismaService), app.get(MembershipsService), { password });

beforeAll(async () => {
  ({ app } = await createTestApp());
  db = testPrisma();
});
beforeEach(() => resetDatabase(db));
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

const counts = async () => ({
  tenants: await db.tenant.count(),
  branches: await db.branch.count(),
  users: await db.user.count(),
  memberships: await db.membership.count(),
  roles: await db.roleAssignment.count({ where: { revokedAt: null } }),
  jobRoles: await db.jobRole.count(),
  credentials: await db.userCredential.count(),
  platformRoles: await db.platformRoleAssignment.count({ where: { revokedAt: null } }),
});

describe('db:seed', () => {
  it('creates the demo model once; a second run changes nothing and sets no password', async () => {
    const first = await run('a seed passphrase for tests');
    expect(first.newPasswords.length).toBe(first.accounts.length);
    const after = await counts();
    expect(after).toMatchObject({ tenants: 2, branches: 4, jobRoles: 5, platformRoles: 1 });
    const second = await run('a seed passphrase for tests');
    expect(second.newPasswords).toEqual([]);
    expect(second.password).toBeNull();
    expect(await counts()).toEqual(after);
  });

  it('covers every role per tenant, a person in both tenants and branches in different time zones', async () => {
    await run('a seed passphrase for tests');
    for (const spec of DEMO_TENANTS) {
      const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: spec.slug } });
      const roles = await db.roleAssignment.findMany({
        where: { tenantId: tenant.id, revokedAt: null },
      });
      expect(new Set(roles.map((r) => r.role))).toEqual(
        new Set([
          'tenant_admin',
          'branch_admin',
          'learning_manager',
          'compliance_viewer',
          'instructor',
          'learner',
        ]),
      );
      const zones = await db.branch.findMany({
        where: { tenantId: tenant.id },
        select: { timezone: true },
      });
      expect(new Set(zones.map((z) => z.timezone)).size).toBe(2);
    }
    const both = await db.user.findUniqueOrThrow({
      where: { email: seedEmail('both-tenants') },
      include: { memberships: { include: { roleAssignments: true } } },
    });
    expect(both.memberships).toHaveLength(2);
    expect(
      new Set(both.memberships.flatMap((m) => m.roleAssignments.map((r) => r.role))).size,
    ).toBe(2);
    // Obviously fictional: every tenant, branch and person is marked Demo.
    for (const t of await db.tenant.findMany()) expect(t.displayName).toMatch(/^Demo /);
    for (const b of await db.branch.findMany()) expect(b.name).toMatch(/^Demo /);
    for (const u of await db.user.findMany({
      where: { email: { endsWith: '@demo.vachelearn.test' } },
    })) {
      expect(u.displayName).toMatch(/\(Demo\)$/);
    }
  });

  it('refuses production, and databases that are not local dev or test', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(run('a seed passphrase for tests')).rejects.toThrow(/production/);
    } finally {
      process.env.NODE_ENV = previous;
    }
    expect(await db.tenant.count()).toBe(0);
    expect(
      refuseUnlessLocalDatabase('postgresql://u:p@db.example.com:5432/vachelearn', {
        purpose: 'reset',
      }),
    ).toMatch(/not localhost/);
    expect(
      refuseUnlessLocalDatabase('postgresql://u:p@localhost:5432/production', { purpose: 'reset' }),
    ).toMatch(/not the local dev database/);
  });

  it('never changes an existing password, even with another SEED_PASSWORD; the platform admin has no tenant roles (D-095)', async () => {
    await run('a seed passphrase for tests');
    const hashes = await db.userCredential.findMany({ orderBy: { userId: 'asc' } });
    const again = await run('a different passphrase entirely');
    expect(again.newPasswords).toEqual([]);
    expect(await db.userCredential.findMany({ orderBy: { userId: 'asc' } })).toEqual(hashes);
    const staff = await db.user.findUniqueOrThrow({
      where: { email: seedEmail('platform-admin') },
      include: { memberships: true, platformRoles: true },
    });
    expect(staff.memberships).toEqual([]);
    expect(staff.platformRoles.map((r) => r.role)).toEqual(['platform_super_admin']);
    // And no tenant account holds a platform role.
    expect(await db.platformRoleAssignment.count({ where: { userId: { not: staff.id } } })).toBe(0);
  });

  it('refuses a database holding anything but demo data (the dev database guard)', () => {
    expect(demoFenceProblem(['demo-manufacturing'], ['admin.x@demo.vachelearn.test'])).toBeNull();
    expect(demoFenceProblem(['acme-real'], [])).toMatch(/not demo data/);
    expect(demoFenceProblem(['demo-logistics'], ['someone@company.com'])).toMatch(/\.test domain/);
  });
});
