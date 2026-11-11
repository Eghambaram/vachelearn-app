import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { MembershipsService } from '../access/memberships.service';
import { AppModule } from '../app.module';
import { loadConfig } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { seedDemo } from '../seed/demo-seed';

/*
 * `pnpm --filter api db:seed` (Slice 2.6b): demo data for local development (see src/seed/demo-seed.ts). Refuses to run
 * with NODE_ENV=production or against anything but a local dev or test database — checked here too, so running the
 * built file directly cannot skip the package script's guard (isolation review 2.6b) — and seedDemo refuses a dev
 * database holding anything but demo data. Passwords: SEED_PASSWORD (at least 12 characters) or a random one, printed
 * once for the accounts that got it now; never stored anywhere else.
 */

type Guard = {
  refuseUnlessLocalDatabase: (raw: string | undefined, o: { purpose: 'reset' }) => string | null;
};

async function main() {
  if (process.env.NODE_ENV === 'production')
    return fail('db:seed refuses to run with NODE_ENV=production.');
  // The same URL guard as `db:reset`, an ES module shared with scripts/ and the tests; loaded at run time from
  // apps/api/scripts (this file runs as dist/src/cli/seed.js).
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- require(esm), Node 24
  const guard = require(join(__dirname, '../../../scripts/database-guard.mjs')) as Guard;
  const refused = guard.refuseUnlessLocalDatabase(process.env.DATABASE_URL, { purpose: 'reset' });
  if (refused) return fail(`db:seed refuses this database: ${refused}.`);
  const fromEnv = process.env.SEED_PASSWORD;
  if (fromEnv !== undefined && fromEnv.length < 12) {
    return fail(
      'SEED_PASSWORD must be at least 12 characters (or leave it unset for a random one).',
    );
  }

  const config = loadConfig({ ...process.env, JOBS_WORKER: 'false', LOG_LEVEL: 'warn' });
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), {
    logger: ['error', 'warn'],
  });
  try {
    const result = await seedDemo(app.get(PrismaService), app.get(MembershipsService), {
      password: fromEnv,
    });
    console.log(`Demo data ready: ${result.accounts.length} accounts (all names marked "Demo").`);
    if (result.newPasswords.length === 0) {
      console.log('No new accounts: existing passwords were left unchanged.');
    } else {
      // Demo addresses, not secrets: which accounts got the password in this run.
      console.log(`New accounts: ${result.newPasswords.join(', ')}`);
      if (fromEnv) console.log('They use SEED_PASSWORD.');
      // Printed once, for local use only; not stored anywhere else.
      else console.log(`Their password (shown once): ${result.password}`);
    }
    console.log('Sign in as, for example, admin.demo-manufacturing@demo.vachelearn.test');
  } finally {
    await app.close();
  }
}

function fail(message: string) {
  console.error(message);
  process.exitCode = 1;
}

main().catch((err: unknown) => {
  fail(`db:seed failed: ${err instanceof Error ? err.message : String(err)}`);
});
