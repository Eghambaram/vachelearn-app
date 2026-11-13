import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

/*
 * End-to-end tests only: empties `rate_limit_buckets` in the local **test** database before a test signs in or sets a
 * password. The whole Playwright suite signs in from one address (127.0.0.1), so the real per-IP limits (D-112,
 * set-password 30 / 15 min) would otherwise trip once the suite grows; the limits themselves stay as they are and are
 * tested by the API tests (auth, password links, invitations). Refuses NODE_ENV=production and any database but a
 * local `*_test` one — by URL and by asking the server which database it is.
 */

type Guard = {
  refuseUnlessLocalDatabase: (raw: string | undefined, o: { purpose: 'test' }) => string | null;
};

async function main() {
  if (process.env.NODE_ENV === 'production') return fail('refuses NODE_ENV=production.');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- require(esm), Node 24
  const guard = require(join(__dirname, '../../../scripts/database-guard.mjs')) as Guard;
  const url = process.env.DATABASE_URL;
  const refused = guard.refuseUnlessLocalDatabase(url, { purpose: 'test' });
  if (refused) return fail(`refuses this database: ${refused}.`);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  try {
    const [row] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (!row?.name.endsWith('_test'))
      return fail('the connected database is not a _test database.');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE rate_limit_buckets');
  } finally {
    await prisma.$disconnect();
  }
}

function fail(message: string) {
  process.stderr.write(`e2e-reset-limits ${message}\n`);
  process.exitCode = 1;
}

void main();
