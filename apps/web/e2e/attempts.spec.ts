import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const OPEN = '/learn/attempts/demo-tenant-1-demo-user-enr-03-att-2';
const FAILED = '/learn/attempts/demo-tenant-1-demo-user-enr-03-att-1';
const PASSED = '/learn/attempts/demo-tenant-1-demo-user-enr-07-att-2';
const TIMED_OUT = '/learn/attempts/demo-tenant-1-demo-user-enr-02-att-1';
const SOMEONE_ELSE = '/learn/attempts/demo-tenant-1-demo-other-learner-enr-01-att-1';

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

test.describe('Assessment taking and results on demo data (Slice 1.5.6)', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: 'vl_demo_role', value: 'learner', url: baseURL! }]);
  });

  test('the course’s assessment lesson leads to the open attempt', async ({ page }) => {
    await page.goto('/learn/courses/demo-tenant-1-demo-user-enr-03');
    const nav = page.getByRole('navigation', { name: 'Course content' });
    const toggle = nav.getByRole('button', { name: /Course content ·/ });
    if (await toggle.isVisible()) await toggle.click();
    await nav.getByRole('link', { name: /Final check/ }).click();
    await page.getByRole('link', { name: 'Continue attempt 2' }).click();
    await expect(page).toHaveURL(new RegExp(`${OPEN}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Final check (Demo)' })).toBeVisible();
    await expect(page.getByText('Attempt 2 of 3 · Version 1 · pass mark 70%')).toBeVisible();
    await expect(page.getByRole('note')).toContainText('Demo — answers are not saved');
    await expect(page.locator('[data-slot="page-header"] [data-slot="demo-badge"]')).toBeVisible();
    await expect(page.getByRole('timer')).toHaveText(/^1[12]:\d\d$/);
    await expect(page.getByText('3 of 10 answered').first()).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('keyboard only: answer, move on, review and submit (not connected)', async ({ page }) => {
    await page.goto(OPEN);
    const first = page.getByRole('radio', { name: 'Check for visible hazards around the machine' });
    await expect(first).toBeChecked();
    await first.focus();
    // Radix selects the radio when focus lands while the arrow key is held; `press` releases it before that.
    await page.keyboard.down('ArrowDown');
    await expect(page.getByRole('radio', { name: 'Start the machine immediately' })).toBeChecked();
    await page.keyboard.up('ArrowDown');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Next question' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Question 2 of 10 · 1 point')).toBeVisible();
    await expect(page.locator('#attempt-heading')).toBeFocused();

    await page.getByRole('button', { name: 'Question 10, not answered' }).click();
    await page.getByRole('button', { name: 'Review answers' }).click();
    await expect(page.getByRole('heading', { name: 'Review your answers' })).toBeFocused();
    await page.getByRole('button', { name: 'Submit answers' }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('alertdialog', { name: 'Submit your answers?' });
    await expect(dialog).toContainText('You cannot change your answers after submitting.');
    await dialog.getByRole('button', { name: 'Submit answers' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Not yet connected' })).toContainText(
      'Nothing was submitted.',
    );
    // Nothing was scored or saved.
    await page.reload();
    await expect(page.getByText('3 of 10 answered').first()).toBeVisible();
    await expect(
      page.getByRole('radio', { name: 'Check for visible hazards around the machine' }),
    ).toBeChecked();
  });

  test('results show the score only (D-023) and keep every attempt', async ({ page }) => {
    await page.goto(FAILED);
    await expect(page.getByText('58.3%').first()).toBeVisible();
    await expect(page.getByText('7 of 12 points')).toBeVisible();
    await expect(page.getByText('Pass mark 70%', { exact: true })).toBeVisible();
    await expect(page.getByText(/first step before operating a machine/)).toHaveCount(0);
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(3);
    await expectNoAxeViolations(page);

    await page.goto(PASSED);
    await expect(
      page.getByText(/You passed\. Passing this assessment is one requirement/),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Start attempt/ })).toHaveCount(0);

    await page.goto(TIMED_OUT);
    await expect(page.getByText(/Time ran out/)).toBeVisible();
    await page.getByRole('button', { name: 'Start attempt 2 of 3' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'No attempt was started.' }),
    ).toBeVisible();
  });

  test('someone else’s attempt is a 404 in every demo state', async ({ page }) => {
    for (const query of ['', '?demoState=loading', '?demoState=error', '?demoState=forbidden']) {
      expect((await page.goto(`${SOMEONE_ELSE}${query}`))?.status()).toBe(404);
    }
    expect(
      (await page.goto('/learn/attempts/demo-tenant-2-demo-user-enr-03-att-2'))?.status(),
    ).toBe(404);
  });

  test('demo states: loading, error, forbidden', async ({ page }) => {
    await page.goto(`${OPEN}?demoState=loading`);
    await expect(page.getByRole('status', { name: 'Loading…' })).toBeVisible();
    await page.goto(`${OPEN}?demoState=error`);
    await expect(page.getByRole('alert').filter({ hasText: 'req_demo_0500' })).toBeVisible();
    await page.goto(`${OPEN}?demoState=forbidden`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'You do not have access to this' }),
    ).toBeVisible();
  });

  test('360 px: no sideways scroll; the next question stays in reach', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(OPEN);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole('button', { name: 'Next question' })).toBeInViewport();
    await expectNoAxeViolations(page);
    await page.goto(FAILED);
    const resultOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(resultOverflow).toBeLessThanOrEqual(0);
  });
});
