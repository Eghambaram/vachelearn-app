import { test as setup } from '@playwright/test';
import { seedDemoData } from './real-users';

/*
 * Playwright setup project (Slice 2.6c): seeds the demo data once, before any spec, so the per-role smoke signs in as
 * the seeded accounts. The seed is idempotent, but not safe to run twice at the same time — hence one setup project
 * rather than a beforeAll in each worker.
 */

setup('demo data (db:seed)', () => {
  seedDemoData();
});
