import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

test.describe('Learner dashboard on demo data (Slice 1.5.4)', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: 'vl_demo_role', value: 'learner', url: baseURL! }]);
  });

  test('shows own learning: summary, continue, deadlines and completions, labelled Demo', async ({
    page,
  }) => {
    await page.goto('/learn');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Welcome back, Demo User' }),
    ).toBeVisible();
    await expect(page.locator('[data-slot="page-header"] [data-slot="demo-badge"]')).toBeVisible();
    const summary = page.getByRole('region', { name: 'Your learning at a glance' });
    await expect(summary.getByRole('group', { name: 'Overdue' })).toContainText('2');
    await expect(summary.getByRole('group', { name: 'Completed' })).toContainText('5');
    // Progress is announced with its value, and written out in text too.
    await expect(
      page.getByRole('progressbar', { name: 'Progress in Fire Safety Refresher (Demo)' }),
    ).toHaveAttribute('aria-valuenow', '60');
    await expect(page.getByText('60% of required lessons done')).toBeVisible();
    // Overdue is derived (D-054) and shown in words as well as colour.
    await expect(page.getByText(/days overdue/).first()).toBeVisible();
    // Completion and certification are distinguished (spec §8).
    await expect(page.getByText('No certificate for this course')).toBeVisible();
    await expect(page.getByText(/Certificate issued/).first()).toBeVisible();
    // Another learner's courses never appear.
    await expect(page.getByText('Electrical Safety (Demo)')).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test('"Continue" opens the learner’s own enrollment; someone else’s is a 404', async ({
    page,
  }) => {
    await page.goto('/learn');
    await page.getByRole('link', { name: 'Continue Fire Safety Refresher (Demo)' }).first().click();
    // The player resumes at the lesson the server reports (slice 1.5.5).
    await expect(page).toHaveURL(
      /\/learn\/courses\/demo-tenant-1-demo-user-enr-01\/lessons\/[^/]+$/,
    );
    await expect(
      page.getByRole('heading', { level: 1, name: 'Fire Safety Refresher (Demo)' }),
    ).toBeVisible();
    const response = await page.goto('/learn/courses/demo-tenant-1-demo-other-learner-enr-01');
    expect(response?.status()).toBe(404);
  });

  test('demo states: loading, empty, error, forbidden', async ({ page }) => {
    await page.goto('/learn?demoState=loading');
    await expect(page.getByRole('group', { name: 'Overdue' })).toHaveAttribute('aria-busy', 'true');
    await page.goto('/learn?demoState=empty');
    await expect(page.getByRole('heading', { name: 'No learning assigned yet' })).toBeVisible();
    await page.goto('/learn?demoState=error');
    await expect(page.getByRole('alert').filter({ hasText: 'req_demo_0500' })).toBeVisible();
    await page.goto('/learn?demoState=forbidden');
    await expect(
      page.getByRole('heading', { level: 1, name: 'You do not have access to this' }),
    ).toBeVisible();
  });

  test('360 px: no sideways scroll, nothing clipped, and Continue stays in reach', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/learn');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(pageOverflow).toBeLessThanOrEqual(0);
    const clipped = await page
      .locator('[data-slot="kpi-card"]')
      .evaluateAll((cards) => cards.filter((c) => c.scrollWidth > c.clientWidth).length);
    expect(clipped).toBe(0);
    const sticky = page.getByRole('link', { name: 'Continue Fire Safety Refresher (Demo)' }).last();
    await expect(sticky).toBeInViewport();
    await expectNoAxeViolations(page);
  });
});
