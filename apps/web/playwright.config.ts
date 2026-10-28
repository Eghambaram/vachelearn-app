import { defineConfig, devices } from '@playwright/test';

const port = 3100;
export const E2E_API_PORT = 4100;

/*
 * End-to-end auth tests (Slice 2.3d) need the real API: it runs on :4100 against the integration-test database and
 * Mailpit (infra/docker-compose.yml locally; services in CI), and the web build forwards /api/v1 to it (D-085).
 */
export const E2E_API_ENV = {
  NODE_ENV: 'development' as const,
  API_PORT: String(E2E_API_PORT),
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgresql://vachelearn:change-me@localhost:55432/vachelearn_test',
  WEB_ORIGIN: `http://localhost:${port}`,
  ENABLE_API_DOCS: 'false',
  JOBS_WORKER: 'true',
  TRUST_PROXY_HOPS: '0',
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: process.env.MAILPIT_SMTP_PORT ?? '51025',
  LOG_LEVEL: 'warn',
};

export default defineConfig({
  testDir: './e2e',
  // Full-page axe scans of chart-heavy pages take 20-40 s when the suite runs in parallel on a loaded WSL machine
  // (CI runs the whole suite in under a minute). Time only: no assertion is narrowed.
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  // Locally (WSL, 7 GB RAM) four parallel Chromium + axe workers starve the machine and tests time out; two keep it
  // stable. CI keeps Playwright's default.
  workers: process.env.CI ? undefined : 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-360',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 780 } },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter api build && pnpm --filter api db:deploy && pnpm --filter api start',
      url: `http://localhost:${E2E_API_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      env: E2E_API_ENV,
      timeout: 180_000,
    },
    {
      // Tests run against a production build so dev-only overlays never affect accessibility results.
      command: `pnpm build && pnpm exec next start --port ${port}`,
      url: `http://localhost:${port}`,
      reuseExistingServer: !process.env.CI,
      // The /design developer tool, the demo workspaces (D-063) and demo verification (D-074) are off in production
      // builds unless enabled. API_INTERNAL_URL is baked into the /api/v1 rewrite at build time.
      env: {
        ENABLE_DESIGN_GALLERY: 'true',
        ENABLE_DEMO_WORKSPACES: 'true',
        ENABLE_DEMO_VERIFICATION: 'true',
        API_INTERNAL_URL: `http://localhost:${E2E_API_PORT}`,
      },
      timeout: 180_000,
    },
  ],
});
