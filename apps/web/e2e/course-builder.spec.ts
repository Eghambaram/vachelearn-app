import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The content step is one large form (~100 controls); its axe scan plus a cold server start exceeded 60 s once in a
// full local run (passed 6/6 when repeated). Same allowance as the gallery spec; no assertion is narrowed.
test.describe.configure({ timeout: 90_000 });

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const COURSE = '/admin/courses/demo-tenant-1-course-002/build';

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

const stepHeading = (page: Page, name: string) => page.getByRole('heading', { level: 2, name });

test.describe('Course builder on demo data (Slice 1.5.3b)', () => {
  test('opens from the course list for course editors, with the not-saved banner', async ({
    page,
  }) => {
    await page.goto('/admin/courses');
    await page.getByRole('link', { name: 'Forklift Operation Basics (Demo)' }).click();
    await expect(page).toHaveURL(new RegExp(`${COURSE}$`));
    await expect(
      page.getByRole('heading', { level: 1, name: 'Forklift Operation Basics (Demo)' }),
    ).toBeVisible();
    await expect(page.getByRole('note')).toContainText('changes you make here are not saved');
    await expect(stepHeading(page, 'Basic information')).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Course title/ })).toHaveValue(
      'Forklift Operation Basics (Demo)',
    );
    await expectNoAxeViolations(page);
  });

  test('steps move with Continue/Back and the stepper, keeping edits', async ({ page }) => {
    await page.goto(COURSE);
    const title = page.getByRole('textbox', { name: /Course title/ });
    await title.fill('Forklift Basics — edited');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/step=content/);
    await expect(stepHeading(page, 'Content')).toBeFocused();
    await page
      .getByRole('group', { name: 'Course builder steps' })
      .getByRole('button', { name: /Basic information/ })
      .click();
    await expect(title).toHaveValue('Forklift Basics — edited');
  });

  test('reorders lessons with the keyboard and announces the move', async ({ page }) => {
    await page.goto(`${COURSE}?step=content`);
    const titles = () =>
      page
        .getByRole('textbox', { name: 'Lesson title' })
        .evaluateAll((els) => els.slice(0, 2).map((e) => (e as HTMLInputElement).value));
    expect(await titles()).toEqual(['Lesson 1.1 (Demo)', 'Lesson 1.2 (Demo)']);
    await page.getByRole('button', { name: 'Move Lesson 1.1 (Demo) down' }).focus();
    await page.keyboard.press('Enter');
    expect(await titles()).toEqual(['Lesson 1.2 (Demo)', 'Lesson 1.1 (Demo)']);
    await expect(page.getByRole('button', { name: 'Move Lesson 1.1 (Demo) down' })).toBeFocused();
    await expect(page.getByText('Lesson 1.1 (Demo) moved to position 2 of 4.')).toBeAttached();
    await expectNoAxeViolations(page);
  });

  test('adds a module and a lesson, and removes a lesson after confirming', async ({ page }) => {
    await page.goto(`${COURSE}?step=content`);
    await page.getByRole('button', { name: 'Add module' }).click();
    await expect(page.getByRole('textbox', { name: 'Module 5 title' })).toHaveValue('New module');
    await page.getByRole('button', { name: 'Add lesson (New module)' }).click();
    await expect(page.getByRole('textbox', { name: 'Lesson title' }).last()).toHaveValue(
      'New lesson',
    );
    await page.getByRole('button', { name: 'Remove Lesson 1.1 (Demo)' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Remove lesson “Lesson 1.1 (Demo)”?' });
    await expect(dialog).toContainText('The published version is not affected.');
    await dialog.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('textbox', { name: 'Lesson title' }).first()).toHaveValue(
      'Lesson 1.2 (Demo)',
    );
  });

  test('publish shows the checklist and never pretends to save or publish', async ({ page }) => {
    await page.goto(`${COURSE}?step=publish`);
    await expect(page.getByText('Ready to publish')).toBeVisible();
    await expect(page.getByText(/Publishing creates version 4/)).toBeVisible();
    await page.getByRole('button', { name: 'Publish version 4' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Not yet connected' })).toBeVisible();
    await page.goto('/admin/courses/new/build?step=publish');
    await expect(page.getByText('Fix these before publishing')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish version 1' })).toBeDisabled();
    await page.getByRole('button', { name: 'Go to Content' }).click();
    await expect(page).toHaveURL(/step=content/);
    await expectNoAxeViolations(page);
  });

  test('"Create course" opens an empty builder; read-only roles see no editing entry points', async ({
    page,
    context,
    baseURL,
  }) => {
    await page.goto('/admin/courses');
    await page.getByRole('link', { name: 'Create course' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'New course' })).toBeVisible();
    await context.addCookies([{ name: 'vl_demo_role', value: 'learning_manager', url: baseURL! }]);
    await page.goto('/admin/courses');
    await expect(page.getByRole('link', { name: 'Create course' })).toHaveCount(0);
    await expect(page.getByRole('table', { name: 'Courses' }).getByRole('link')).toHaveCount(0);
    await page.goto(COURSE);
    await expect(
      page.getByRole('heading', { level: 1, name: 'You do not have access to this' }),
    ).toBeVisible();
  });

  test("another tenant's course is not found (404)", async ({ page }) => {
    const response = await page.goto('/admin/courses/demo-tenant-2-course-001/build');
    expect(response?.status()).toBe(404);
  });

  test('archived courses cannot be edited', async ({ page }) => {
    await page.goto('/admin/courses/demo-tenant-1-course-011/build');
    await expect(
      page.getByText('This course is archived. Restore it before editing.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);
  });

  test('fits 360 px without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`${COURSE}?step=content`);
    await expect(stepHeading(page, 'Content')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
