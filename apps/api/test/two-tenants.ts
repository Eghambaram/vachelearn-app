import type { PrismaClient } from '../generated/prisma/client';
import type { TenantRole } from '../src/access/permissions';
import { OPERATOR, type realActors } from './sessions';

/*
 * The shared two-tenant fixture (.claude/rules/testing.md, Slice 2.6b): tenant A (branches A1, A2) and tenant B (branch
 * B1); one account per role — tenant-wide and branch-scoped where the matrix allows both; one person who belongs to
 * both tenants with different roles; a platform staff member. Every account signs in with TEST_PASSWORD. Build it once
 * per test (after `resetDatabase`) — never hand-roll another fixture for an isolation spec.
 */

type Grant = { role: TenantRole; tenant: 'A' | 'B'; branch?: 'A1' | 'A2' | 'B1' };

/** Who is in the fixture: email (local part) → their roles. */
export const PEOPLE = {
  adminA: [{ role: 'tenant_admin', tenant: 'A' }],
  baA1: [{ role: 'branch_admin', tenant: 'A', branch: 'A1' }],
  lmA: [{ role: 'learning_manager', tenant: 'A' }],
  lmA1: [{ role: 'learning_manager', tenant: 'A', branch: 'A1' }],
  cvA: [{ role: 'compliance_viewer', tenant: 'A' }],
  cvA1: [{ role: 'compliance_viewer', tenant: 'A', branch: 'A1' }],
  insA1: [{ role: 'instructor', tenant: 'A', branch: 'A1' }],
  learnerA1: [{ role: 'learner', tenant: 'A', branch: 'A1' }],
  learnerA2: [{ role: 'learner', tenant: 'A', branch: 'A2' }],
  adminB: [{ role: 'tenant_admin', tenant: 'B' }],
  baB1: [{ role: 'branch_admin', tenant: 'B', branch: 'B1' }],
  learnerB1: [{ role: 'learner', tenant: 'B', branch: 'B1' }],
  /** One person in both tenants, with different roles. */
  both: [
    { role: 'learner', tenant: 'A', branch: 'A2' },
    { role: 'learning_manager', tenant: 'B' },
  ],
} as const satisfies Record<string, readonly Grant[]>;

export type Person = keyof typeof PEOPLE;
export const emailOf = (person: Person | 'staff') => `${person.toLowerCase()}@two-tenants.test`;

export type TwoTenants = {
  tenant: { A: string; B: string };
  branch: { A1: string; A2: string; B1: string };
  /** Membership ids: `member.adminA`, and for `both` its two memberships. */
  member: Record<Exclude<Person, 'both'>, string> & { bothA: string; bothB: string };
  user: Record<Person | 'staff', string>;
};

export async function buildTwoTenants(
  db: PrismaClient,
  actors: ReturnType<typeof realActors>,
): Promise<TwoTenants> {
  const tenant = async (slug: string) =>
    (
      await db.tenant.create({
        data: {
          slug,
          displayName: `${slug} (Demo)`,
          defaultTimezone: 'Asia/Kolkata',
          settings: { create: {} },
        },
      })
    ).id;
  const A = await tenant('tenant-a');
  const B = await tenant('tenant-b');
  const branch = async (tenantId: string, code: string, timezone: string) =>
    (await db.branch.create({ data: { tenantId, code, name: `Branch ${code}`, timezone } })).id;
  const branches = {
    A1: await branch(A, 'A1', 'Asia/Kolkata'),
    A2: await branch(A, 'A2', 'America/Chicago'),
    B1: await branch(B, 'B1', 'Europe/London'),
  };
  const tenants = { A, B };

  const user = {} as TwoTenants['user'];
  const member = {} as TwoTenants['member'];
  for (const [person, grants] of Object.entries(PEOPLE) as [Person, readonly Grant[]][]) {
    const id = await actors.user(emailOf(person));
    user[person] = id;
    for (const g of grants) {
      const { membershipId } = await actors.grant(
        id,
        tenants[g.tenant],
        g.role,
        g.branch ? branches[g.branch] : null,
      );
      if (person === 'both') member[g.tenant === 'A' ? 'bothA' : 'bothB'] = membershipId;
      else member[person] = membershipId;
    }
  }
  user.staff = await actors.user(emailOf('staff'));
  await actors
    .memberships()
    .operatorGrantPlatformRole({ userId: user.staff, role: 'platform_super_admin' }, OPERATOR);
  return { tenant: tenants, branch: branches, member, user };
}
