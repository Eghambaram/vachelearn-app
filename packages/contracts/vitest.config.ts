import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    // The first Intl.DateTimeFormat with a time zone loads ICU zone data; while `pnpm -r test` runs every package in
    // parallel that took 6.4 s once (clean-clone run, 2026-10-27). Time allowance only — no assertion is changed.
    testTimeout: 15_000,
  },
});
