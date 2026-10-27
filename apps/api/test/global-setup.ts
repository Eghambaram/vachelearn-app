import { execFileSync } from 'node:child_process';
import { refuseUnlessLocalDatabase } from '../scripts/database-guard.mjs';

export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://vachelearn:change-me@localhost:55432/vachelearn_test';

/**
 * Runs once before the integration tests: refuses anything but a local "_test" database (the same guard as
 * `db:reset`), then applies every migration (`prisma migrate deploy`), so the schema under test is exactly what
 * migrations produce.
 */
export default function setup() {
  const raw = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  const reason = refuseUnlessLocalDatabase(raw, { purpose: 'test' });
  if (reason) throw new Error(`Refusing to run integration tests: ${reason}.`);
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: raw },
  });
}
