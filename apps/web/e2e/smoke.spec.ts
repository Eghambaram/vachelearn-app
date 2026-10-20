import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('home page renders the scaffold heading', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'VacheLearn — scaffold' }),
  ).toBeVisible();
});

test('home page has no detectable accessibility violations (WCAG 2.x A/AA)', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
