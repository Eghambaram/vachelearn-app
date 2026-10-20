import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('/design token sheet (ENABLE_DESIGN_GALLERY=true in the E2E server)', () => {
  test('renders tokens, contrast results and buttons with no failing pair', async ({ page }) => {
    await page.goto('/design');
    await expect(page.getByRole('heading', { level: 1, name: 'Design tokens' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Contrast pairs', exact: true })).toBeVisible();
    await expect(page.getByText('Fail', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Primary' })).toBeVisible();
  });

  test('loads the self-hosted Inter font, including the rupee sign', async ({ page }) => {
    await page.goto('/design');
    const loaded = await page.evaluate(async () => {
      const faces = await document.fonts.load('16px "Inter Variable"', '₹ Aa');
      return faces.length;
    });
    expect(loaded).toBeGreaterThan(0);
  });

  test('has no detectable accessibility violations (WCAG 2.x A/AA)', async ({ page }) => {
    await page.goto('/design');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('shows the inverse focus ring on the dark sidebar surface', async ({ page }) => {
    await page.goto('/design');
    const link = page.getByRole('link', { name: 'Focusable link (inverse focus ring)' });
    await link.focus();
    const outline = await link.evaluate((el) => getComputedStyle(el).outlineColor);
    const inverse = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--vl-color-focus-ring-inverse)';
      document.body.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    });
    expect(outline).toBe(inverse);
  });
});
