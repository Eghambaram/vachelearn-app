import { execFileSync } from 'node:child_process';
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { refuseUnlessLocalDatabase } from '../scripts/database-guard.mjs';

export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://vachelearn:change-me@localhost:55432/vachelearn_test';

/**
 * Runs once before the integration tests: refuses anything but a local "_test" database (the same guard as
 * `db:reset`), then applies every migration (`prisma migrate deploy`), so the schema under test is exactly what
 * migrations produce.
 */
export default async function setup() {
  const raw = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  const reason = refuseUnlessLocalDatabase(raw, { purpose: 'test' });
  if (reason) throw new Error(`Refusing to run integration tests: ${reason}.`);
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: raw },
  });
  await ensureTestBucket();
}

/** The asset tests store real objects (D-131): the test bucket must exist on the local (or CI) RustFS. */
async function ensureTestBucket() {
  const bucket = 'vachelearn-assets-test';
  const client = new S3Client({
    endpoint: process.env.TEST_STORAGE_ENDPOINT ?? 'http://127.0.0.1:59000',
    region: 'us-east-1',
    forcePathStyle: true,
    // The local placeholders from infra/docker-compose.yml (CI uses the same).
    credentials: { accessKeyId: 'vachelearn-local', secretAccessKey: 'change-me-local-storage' },
  });
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (err) {
      throw new Error(
        `Object storage is not reachable for the tests (${(err as Error).name}). Run pnpm services:up.`,
      );
    }
  }
}
