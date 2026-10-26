import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const REPORT = '/admin/reports/compliance';

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

async function asRole(page: Page, role: string, baseURL: string) {
  await page.context().addCookies([{ name: 'vl_demo_role', value: role, url: baseURL }]);
}

test.describe('Compliance report on demo data (Slice 1.5.8)', () => {
  test('reports index → compliance report with scope banner, totals and table', async ({
    page,
    baseURL,
  }) => {
    await asRole(page, 'tenant_admin', baseURL!);
    await page.goto('/admin/reports');
    await page.getByRole('link', { name: /Open report/ }).click();
    await expect(page).toHaveURL(new RegExp(`${REPORT}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Compliance status' })).toBeVisible();
    await expect(page.locator('[data-slot="page-header"] [data-slot="demo-badge"]')).toBeVisible();
    const banner = page.getByRole('note', { name: 'Report scope' });
    await expect(banner).toContainText('Scope: Example Manufacturing (Demo) (all branches)');
    await expect(banner).toContainText('Filters: none');
    await expect(banner).toContainText(/Generated .* IST · 120 rows/);
    await expect(page.getByRole('region', { name: 'Totals by status' })).toContainText('Overdue');
    // CSV export is not built: disabled, with the reason written beside it.
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    await expect(page.getByText(/CSV export arrives in Phase 5/)).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('filters and pages come from the server; the banner says what was applied', async ({
    page,
    baseURL,
  }) => {
    await asRole(page, 'tenant_admin', baseURL!);
    await page.goto(REPORT);
    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: 'Due Soon' }).click();
    const banner = page.getByRole('note', { name: 'Report scope' });
    await expect(banner).toContainText('Filters: Status = Due Soon');
    const rows = page.getByRole('table').getByRole('row');
    await expect(rows.nth(1)).toContainText('Due Soon');
    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: 'All statuses' }).click();
    await expect(banner).toContainText('Filters: none');
    await page.getByRole('button', { name: /Next page/i }).click();
    await expect(page.getByText(/Page 2/)).toBeVisible();
  });

  test('a branch admin sees their branch only (D-026)', async ({ page, baseURL }) => {
    await asRole(page, 'branch_admin', baseURL!);
    await page.goto(REPORT);
    await expect(page.getByRole('note', { name: 'Report scope' })).toContainText(
      'Scope: Example Branch A1 ·',
    );
    const table = page.getByRole('table');
    await expect(table.getByRole('row').nth(1)).toBeVisible();
    await expect(table.getByText(/Example Branch A2|Example Head Office/)).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Branch' }).click();
    await expect(page.getByRole('option')).toHaveText([
      'All branches in scope',
      'Example Branch A1',
    ]);
  });

  test('demo states: loading, empty, error, forbidden', async ({ page, baseURL }) => {
    await asRole(page, 'tenant_admin', baseURL!);
    await page.goto(`${REPORT}?demoState=loading`);
    await expect(page.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    await page.goto(`${REPORT}?demoState=empty`);
    await expect(page.getByRole('heading', { name: 'No compliance records' })).toBeVisible();
    await page.goto(`${REPORT}?demoState=error`);
    await expect(page.getByRole('alert').filter({ hasText: 'req_demo_0500' })).toBeVisible();
    await page.goto(`${REPORT}?demoState=forbidden`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'You do not have access to this' }),
    ).toBeVisible();
  });

  test('360 px: no sideways page scroll', async ({ page, baseURL }) => {
    await asRole(page, 'tenant_admin', baseURL!);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(REPORT);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expectNoAxeViolations(page);
  });
});
