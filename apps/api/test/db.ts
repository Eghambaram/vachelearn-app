import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { refuseUnlessLocalDatabase } from '../scripts/database-guard.mjs';
import { USER } from './actors';

/** A Prisma client on the test database, for arranging data and asserting rows (audit events, constraints). */
export function testPrisma() {
  const url = process.env.DATABASE_URL;
  const reason = refuseUnlessLocalDatabase(url, { purpose: 'test' });
  if (reason) throw new Error(`Refusing to use the test database: ${reason}.`);
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
}

/** Empties every table (local "_test" database only — the guard above refuses anything else). */
export async function resetDatabase(prisma: PrismaClient) {
  // Ask the server too: the URL guard checked the name we asked for, this checks the one we are connected to.
  const [row] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  const name = row?.name ?? '';
  if (!name.endsWith('_test'))
    throw new Error(`Refusing to empty "${name}": not a _test database.`);
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE password_links, email_deliveries, jobs, audit_events, auth_sessions, user_credentials, users, rate_limit_buckets, branches, tenant_settings, tenants RESTART IDENTITY CASCADE',
  );
  // The fixed test callers are real users: audit rows reference their actor (audit_events.actor_user_id → users).
  await prisma.user.createMany({
    data: Object.entries(USER).map(([key, id]) => ({
      id,
      email: `${key.toLowerCase()}@actors.test`,
      displayName: `Test ${key} (Demo)`,
    })),
  });
}
