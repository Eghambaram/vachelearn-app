// `db:seed` gate (Slice 2.6b): refuses unless DATABASE_URL is a local dev/test database (see database-guard.mjs) and
// NODE_ENV is not production. No opt-in is needed: seeding only adds missing demo rows, it never deletes anything.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { refuseUnlessLocalDatabase } from './database-guard.mjs';

const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv); // never overrides variables already set

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed: NODE_ENV is production.');
  process.exit(1);
}
const reason = refuseUnlessLocalDatabase(process.env.DATABASE_URL, { purpose: 'reset' });
if (reason) {
  console.error(`Refusing to seed: ${reason}.`);
  process.exit(1);
}
