import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration tests run against a real PostgreSQL test database (.claude/rules/testing.md: never a mocked database).
// Locally that is `vachelearn_test` in infra/docker-compose.yml; CI passes TEST_DATABASE_URL. global-setup.ts refuses
// anything whose database name does not end in "_test", then applies the migrations.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://vachelearn:change-me@localhost:55432/vachelearn_test';

export default defineConfig({
  // SWC instead of esbuild: NestJS dependency injection needs emitted decorator metadata, which esbuild drops.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    env: { NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL },
    // One database for every file: run test files one after another.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
