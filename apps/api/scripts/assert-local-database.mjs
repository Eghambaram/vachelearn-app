// `db:reset` gate: refuses unless DATABASE_URL is a local dev/test database (see database-guard.mjs) AND the caller
// opted in for this one command with VL_ALLOW_DB_RESET=1 (never set in .env files, so a stray reset cannot happen).
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { refuseUnlessLocalDatabase } from './database-guard.mjs';

const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv); // never overrides variables already set

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to reset: NODE_ENV is production.');
  process.exit(1);
}
const reason = refuseUnlessLocalDatabase(process.env.DATABASE_URL, { purpose: 'reset' });
if (reason) {
  console.error(`Refusing to reset: ${reason}.`);
  process.exit(1);
}
if (process.env.VL_ALLOW_DB_RESET !== '1') {
  console.error(
    'Refusing to reset: run it as `VL_ALLOW_DB_RESET=1 pnpm --filter api db:reset` to confirm.',
  );
  process.exit(1);
}
const url = new URL(process.env.DATABASE_URL);
console.log(`Resetting local database "${url.pathname.slice(1)}" on ${url.host}.`);
