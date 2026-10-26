import { defineConfig, devices } from '@playwright/test';

const port = 3100;

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
  webServer: {
    // Tests run against a production build so dev-only overlays never affect accessibility results.
    command: `pnpm build && pnpm exec next start --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    // The /design developer tool, the demo workspaces (D-063) and demo verification (D-074) are off in production
    // builds unless enabled.
    env: {
      ENABLE_DESIGN_GALLERY: 'true',
      ENABLE_DEMO_WORKSPACES: 'true',
      ENABLE_DEMO_VERIFICATION: 'true',
    },
    timeout: 180_000,
  },
});
