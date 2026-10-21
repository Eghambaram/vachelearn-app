import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

const table = (page: Page) => page.getByRole('table', { name: 'Courses' });
const bodyRows = (page: Page) => table(page).locator('tbody tr');

async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test.describe('Course list on demo data (Slice 1.5.3a)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/courses');
    await expect(table(page)).toBeVisible();
  });

  test('opens with the first page of courses, labelled Demo, and passes axe', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Courses' })).toBeVisible();
    await expect(page.locator('[data-slot="page-header"] [data-slot="demo-badge"]')).toBeVisible();
    await expect(bodyRows(page)).toHaveCount(25);
    await expect(table(page).getByRole('columnheader', { name: 'Updated' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    await expectNoAxeViolations(page);
  });

  test('filters combine and are applied by the server', async ({ page }) => {
    await choose(page, 'Status', 'Draft');
    await expect(page.getByText('1 filter applied')).toBeVisible();
    // Rows are replaced when the server answers; retry until every row matches the filters.
    const everyRow = async (...texts: string[]) => {
      const rows = await bodyRows(page).allInnerTexts();
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) for (const text of texts) expect(row).toContain(text);
    };
    await expect(() => everyRow('Draft')).toPass();
    await choose(page, 'Level', 'Advanced');
    await expect(page.getByText('2 filters applied')).toBeVisible();
    await expect(() => everyRow('Draft', 'Advanced')).toPass();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(bodyRows(page)).toHaveCount(25);
  });

  test('search is debounced and sent to the server; no match shows a helpful empty state', async ({
    page,
  }) => {
    const search = page.getByRole('searchbox', { name: 'Search courses' });
    await search.fill('forklift');
    await expect(bodyRows(page)).toHaveCount(2);
    await search.fill('no such course');
    await expect(page.getByRole('heading', { name: 'No courses match' })).toBeVisible();
  });

  test('sorting by title from the keyboard asks the server for a new order', async ({ page }) => {
    const header = table(page).getByRole('columnheader', { name: 'Course' });
    await header.getByRole('button').focus();
    await page.keyboard.press('Enter');
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    await expect(bodyRows(page).first()).toContainText('Chemical Handling (Demo)');
    await page.keyboard.press('Enter');
    await expect(header).toHaveAttribute('aria-sort', 'descending');
    await expect(bodyRows(page).first()).toContainText('Working at Height II (Demo)');
  });

  test('cursor pagination goes forward and back, and page size changes restart at page 1', async ({
    page,
  }) => {
    const pagination = page.getByRole('navigation', { name: 'Pagination' });
    const firstTitle = (await bodyRows(page).first().locator('td').first().innerText()).split(
      '\n',
    )[0]!;
    await pagination.getByRole('button', { name: 'Next page' }).click();
    await expect(pagination).toContainText('Page 2');
    await expect(bodyRows(page)).toHaveCount(13);
    await expect(pagination.getByRole('button', { name: 'Next page' })).toBeDisabled();
    await pagination.getByRole('button', { name: 'Previous page' }).click();
    await expect(pagination).toContainText('Page 1');
    await expect(bodyRows(page).first().locator('td').first()).toContainText(firstTitle);
    await choose(page, 'Rows per page', '50');
    await expect(bodyRows(page)).toHaveCount(38);
    await expect(pagination.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  test('read-only roles see the same catalogue (courses are tenant-wide)', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([{ name: 'vl_demo_role', value: 'compliance_viewer', url: baseURL! }]);
    await page.goto('/admin/courses');
    await expect(bodyRows(page)).toHaveCount(25);
  });

  test('demo states: loading, empty, error with retry, forbidden', async ({ page }) => {
    await page.goto('/admin/courses?demoState=loading');
    await expect(table(page)).toHaveAttribute('aria-busy', 'true');
    await page.goto('/admin/courses?demoState=empty');
    await expect(page.getByRole('heading', { name: 'No courses yet' })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.goto('/admin/courses?demoState=error');
    await expect(page.getByRole('alert').filter({ hasText: 'req_demo_0500' })).toBeVisible();
    await page.goto('/admin/courses?demoState=forbidden');
    await expect(
      page.getByRole('heading', { level: 1, name: 'You do not have access to this' }),
    ).toBeVisible();
  });

  test('fits 360 px: the table scrolls inside its region, not the page', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/admin/courses');
    await expect(table(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
