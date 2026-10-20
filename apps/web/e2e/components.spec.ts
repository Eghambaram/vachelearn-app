import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The gallery is one very large page and several tests run full-page axe scans on it; under the full parallel suite
// a scan alone can take 30-40 s on WSL. Generous per-test time instead of narrowing what axe checks.
test.describe.configure({ timeout: 90_000 });

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

test.describe('/design/components gallery (Slice 1.3a)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/design/components');
    await expect(page.getByRole('heading', { level: 1, name: 'Components' })).toBeVisible();
  });

  test('has no detectable accessibility violations (WCAG 2.x A/AA)', async ({ page }) => {
    await expectNoAxeViolations(page);
  });

  test('form fields expose label, required state, help and error to assistive technology', async ({
    page,
  }) => {
    const code = page.getByRole('textbox', { name: 'Branch code (required)' });
    await expect(code).toHaveAttribute('aria-invalid', 'true');
    await expect(code).toHaveAccessibleDescription(
      'This code is already used in your organisation.',
    );
  });

  test('combobox works with the keyboard only', async ({ page }) => {
    const combobox = page.getByRole('combobox', { name: 'Branch' });
    await combobox.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.type('B1');
    await page.keyboard.press('Enter');
    await expect(combobox).toHaveText(/Example Branch B1/);
    await expect(combobox).toBeFocused();
    await expect(combobox).toHaveAttribute('aria-expanded', 'false');
  });

  test('date picker works with the keyboard only and returns focus to the trigger', async ({
    page,
  }) => {
    const trigger = page.getByRole('button', { name: /Due date/ });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const grid = page.getByRole('grid');
    await expect(grid).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(grid).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).not.toHaveText(/Pick a date/);
  });

  test('select opens and chooses with the keyboard', async ({ page }) => {
    const select = page.getByRole('combobox', { name: 'Level' });
    await select.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(select).toHaveText(/Intermediate|Beginner/);
    await expect(select).toBeFocused();
  });

  test('dialog traps focus, closes on Escape and returns focus', async ({ page }) => {
    const trigger = page.getByRole('button', { name: 'Open dialog' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Rename group' });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('drawer closes on Escape and returns focus', async ({ page }) => {
    const trigger = page.getByRole('button', { name: 'Open drawer' });
    await trigger.click();
    const drawer = page.getByRole('dialog', { name: 'Filters' });
    await expect(drawer).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('confirm dialog states impact, cancels on Escape and confirms with a named action', async ({
    page,
  }) => {
    const trigger = page.getByRole('button', { name: 'Archive course' });
    await trigger.click();
    const dialog = page.getByRole('alertdialog', { name: 'Archive “Example course”?' });
    await expect(dialog).toContainText('Existing progress, attempts and certificates are kept.');
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await dialog.getByRole('button', { name: 'Archive course' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: 'marked archived' })).toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test('toast is announced and says nothing was saved', async ({ page }) => {
    await page.getByRole('button', { name: 'Show example toast' }).click();
    // Sonner renders toasts inside a polite live region, so screen readers announce them.
    await expect(
      page.locator('[aria-live]').getByText('Example toast (gallery only — nothing was saved)'),
    ).toBeVisible();
  });
});

test.describe('/design/components data display (Slice 1.3b)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/design/components');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Data table, filter bar and pagination' }),
    ).toBeVisible();
  });

  test('page never scrolls sideways (tables scroll inside their own region)', async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('table sorts from the keyboard and exposes the order with aria-sort', async ({ page }) => {
    const table = page.getByRole('table', { name: 'Example learners' });
    const header = table.getByRole('columnheader', { name: 'Learner' });
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    const firstRow = table.getByRole('row').nth(1);
    await expect(firstRow).toContainText('Example Learner 01');

    await header.getByRole('button', { name: 'Learner' }).focus();
    await page.keyboard.press('Enter');
    await expect(header).toHaveAttribute('aria-sort', 'descending');
    await expect(firstRow).toContainText('Example Learner 37');
  });

  test('cursor pagination moves forward and back', async ({ page }) => {
    const pagination = page.getByRole('navigation', { name: 'Pagination' });
    const previous = pagination.getByRole('button', { name: 'Previous page' });
    const next = pagination.getByRole('button', { name: 'Next page' });
    await expect(previous).toBeDisabled();
    await next.click();
    await expect(pagination).toContainText('Page 2');
    await expect(page.getByRole('table', { name: 'Example learners' })).toContainText(
      'Example Learner 26',
    );
    await expect(next).toBeDisabled();
    await previous.click();
    await expect(pagination).toContainText('Page 1');
  });

  test('search is sent to the (fake) server and an empty result shows the empty state', async ({
    page,
  }) => {
    const search = page.getByRole('searchbox', { name: 'Search learners' });
    await search.fill('Learner 07');
    const table = page.getByRole('table', { name: 'Example learners' });
    await expect(table.getByRole('row')).toHaveCount(2);
    await search.fill('nobody');
    await expect(page.getByRole('heading', { name: 'No learners match' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(table.getByRole('row')).toHaveCount(26);
  });

  test('row actions menu works from the keyboard and returns focus', async ({ page }) => {
    const trigger = page.getByRole('button', { name: 'Actions for Example Learner 01' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    // Radix focuses the first item only when it thinks a keyboard is in use; Chromium's synthetic mousemove after
    // focus() scrolls the page can reset that, so assert focus is inside the menu and use Home (APG) to reach it.
    await expect(menu).toBeVisible();
    expect(await menu.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Home');
    await expect(menu.getByRole('menuitem', { name: 'View progress' })).toBeFocused();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('bulk selection announces the count and offers bulk actions', async ({ page }) => {
    await page.getByRole('checkbox', { name: 'Select all rows on this page' }).click();
    await expect(page.getByText('25 selected')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send reminder' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear selection' }).click();
    await expect(page.getByText('25 selected')).toBeHidden();
  });

  test('loading and error states are accessible', async ({ page }) => {
    await page.getByRole('button', { name: 'loading' }).click();
    await expect(page.getByRole('table', { name: 'Example learners' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await page.getByRole('button', { name: 'error' }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'req_example_0001' });
    await expect(alert).toBeVisible();
    await expectNoAxeViolations(page);
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('table', { name: 'Example learners' })).toBeVisible();
  });

  test('chart switches to its table view with the keyboard', async ({ page }) => {
    const chartTab = page.getByRole('tab', { name: 'Chart' }).first();
    await chartTab.focus();
    await page.keyboard.press('ArrowRight');
    const tableTab = page.getByRole('tab', { name: 'Table' }).first();
    await expect(tableTab).toHaveAttribute('aria-selected', 'true');
    const table = page.getByRole('table', { name: 'Completion by branch' });
    await expect(table.getByRole('rowheader', { name: 'Example Head Office' })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('stepper marks the current step', async ({ page }) => {
    const stepper = page.getByRole('group', { name: 'Course builder progress' });
    await expect(stepper.locator('[aria-current="step"]')).toContainText('Assessment');
  });
});
