import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

test.describe('Platform Admin dashboard on demo data (Slice 1.5.1)', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([
      { name: 'vl_demo_role', value: 'platform_super_admin', url: baseURL! },
    ]);
  });

  test('opens with KPIs, charts, activity and recent tenants, all labelled Demo', async ({
    page,
  }) => {
    await page.goto('/platform');
    await expect(page.getByRole('heading', { level: 1, name: 'Platform dashboard' })).toBeVisible();
    await expect(page).toHaveTitle('Platform dashboard · VacheLearn');
    for (const kpi of ['Tenants', 'Learners', 'Published courses', 'Completion rate']) {
      const card = page.getByRole('group', { name: kpi });
      await expect(card).toBeVisible();
      await expect(card.locator('[data-slot="demo-badge"]')).toBeVisible();
    }
    await expect(page.getByRole('group', { name: 'Completion rate' })).toContainText(/\d+\.\d%/);
    for (const title of ['Tenant growth', 'Enrollment trend', 'Tenants by status']) {
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
    }
    await expect(
      page.getByRole('table', { name: 'Five most recently created tenants' }).getByRole('row'),
    ).toHaveCount(6);
    await expect(page.getByText('Demo Support Engineer')).toBeVisible();
    // Undecided widgets stay out (D-027, D-048).
    await expect(page.getByText(/revenue|subscription|industr/i)).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test('period filter works from the keyboard and the server recomputes', async ({ page }) => {
    await page.goto('/platform');
    await expect(page.getByRole('group', { name: 'Tenants' })).toContainText('in 30 days');
    const period = page.getByRole('combobox', { name: 'Period' });
    await period.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('option', { name: 'Last 12 months' }).press('Enter');
    await expect(page).toHaveURL(/period=12m/);
    await expect(page.getByRole('group', { name: 'Tenants' })).toContainText('in 12 months');
    await expect(period).toHaveText(/Last 12 months/);
  });

  test('an unknown period in the URL falls back to the default', async ({ page }) => {
    await page.goto('/platform?period=forever');
    await expect(page.getByRole('combobox', { name: 'Period' })).toHaveText(/Last 30 days/);
  });

  test('each chart has a table view with the same data', async ({ page }) => {
    await page.goto('/platform?period=12m');
    const growth = page
      .getByRole('heading', { level: 2, name: 'Tenant growth' })
      .locator('xpath=ancestor::*[@data-slot="chart-card"]');
    await growth.getByRole('tab', { name: 'Table' }).click();
    const table = growth.getByRole('table', { name: 'Tenant growth' });
    await expect(table.getByRole('rowheader', { name: 'Oct 2026' })).toBeVisible();
    await expect(table.getByRole('row')).toHaveCount(14);
    await expectNoAxeViolations(page);
  });

  test('loading state keeps the layout and announces loading', async ({ page }) => {
    await page.goto('/platform?demoState=loading');
    await expect(page.getByRole('status', { name: 'Loading…' }).first()).toBeVisible();
    await expect(page.getByRole('group', { name: 'Learners' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await expectNoAxeViolations(page);
  });

  test('empty state shows no fake numbers or empty axes', async ({ page }) => {
    await page.goto('/platform?demoState=empty');
    await expect(page.getByRole('group', { name: 'Completion rate' })).toContainText(
      'No enrollments',
    );
    await expect(page.getByRole('heading', { name: 'No data for this period' })).toHaveCount(3);
    await expect(page.getByRole('heading', { name: 'No tenants yet' })).toBeVisible();
    await expect(page.locator('.recharts-surface')).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test('error state shows a reference, not server details', async ({ page }) => {
    await page.goto('/platform?demoState=error');
    const alert = page.getByRole('alert').filter({ hasText: 'req_demo_0500' });
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText('Internal error');
    await expectNoAxeViolations(page);
  });

  test('forbidden state reveals nothing', async ({ page }) => {
    await page.goto('/platform?demoState=forbidden');
    await expect(
      page.getByRole('heading', { level: 1, name: 'You do not have access to this' }),
    ).toBeVisible();
    await expect(page.getByRole('group', { name: 'Tenants' })).toHaveCount(0);
  });

  test('fits 360 px without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/platform?period=12m');
    await expect(page.getByRole('heading', { level: 1, name: 'Platform dashboard' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
