import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

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
