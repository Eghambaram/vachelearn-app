import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const MINE = '/learn/courses/demo-tenant-1-demo-user-enr-01';
const SOMEONE_ELSE = '/learn/courses/demo-tenant-1-demo-other-learner-enr-01';

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

/** The lesson list is a closed disclosure on phones and always open on desktop. */
async function lessonList(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Course content' });
  const toggle = nav.getByRole('button', { name: /Course content ·/ });
  if (await toggle.isVisible()) await toggle.click();
  return nav;
}

test.describe('Course player on demo data (Slice 1.5.5)', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: 'vl_demo_role', value: 'learner', url: baseURL! }]);
  });

  test('opening a course resumes at the server’s lesson, with progress and the lesson tree', async ({
    page,
  }) => {
    await page.goto(MINE);
    await expect(page).toHaveURL(new RegExp(`${MINE}/lessons/[^/]+$`));
    await expect(
      page.getByRole('heading', { level: 1, name: 'Fire Safety Refresher (Demo)' }),
    ).toBeVisible();
    await expect(page.locator('[data-slot="page-header"] [data-slot="demo-badge"]')).toBeVisible();
    await expect(
      page.getByRole('progressbar', { name: 'Progress in Fire Safety Refresher (Demo)' }),
    ).toHaveAttribute('aria-valuenow', '60');
    await expect(page.getByText('60% complete · 12 of 20 required lessons')).toBeVisible();
    const nav = await lessonList(page);
    await expect(nav.locator('a[aria-current="page"]')).toHaveAccessibleName(
      /In progress · Current lesson/,
    );
    // Out of scope (D-043): no notes, discussion or resources.
    await expect(page.getByText(/^(Notes|Discussion|Resources)$/)).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test('previous / next and the lesson tree move between lessons', async ({ page }) => {
    await page.goto(MINE);
    const heading = page.locator('#lesson-heading');
    await expect(heading).toHaveText(/^4\.1 /);
    await page.getByRole('link', { name: /^Next lesson \(4\.2/ }).click();
    await expect(heading).toHaveText(/^4\.2 /);
    await page.getByRole('link', { name: /^Previous lesson \(4\.1/ }).click();
    await expect(heading).toHaveText(/^4\.1 /);
    const nav = await lessonList(page);
    await nav.getByRole('link', { name: /Welcome to the course/ }).click();
    await expect(heading).toHaveText('1.1 Welcome to the course');
    await expect(page.getByRole('button', { name: 'Previous lesson' })).toBeDisabled();
  });

  test('"Mark as complete" says it is not connected and changes nothing', async ({ page }) => {
    await page.goto(MINE);
    const nav = await lessonList(page);
    // 4.2 is a reading (manual completion) that has not been completed.
    await nav.getByRole('link', { name: /Working with others/ }).click();
    await expect(page.locator('#lesson-heading')).toHaveText('4.2 Working with others');
    await page.getByRole('button', { name: 'Mark as complete' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Not yet connected' })).toContainText(
      'Nothing was saved.',
    );
    await page.reload();
    await expect(page.getByRole('progressbar', { name: /Progress in/ })).toHaveAttribute(
      'aria-valuenow',
      '60',
    );
    await expect(page.getByRole('button', { name: 'Mark as complete' })).toBeVisible();
  });

  test('someone else’s enrollment, or a lesson from another course, is a 404', async ({ page }) => {
    expect((await page.goto(SOMEONE_ELSE))?.status()).toBe(404);
    expect((await page.goto(`${SOMEONE_ELSE}/lessons/x`))?.status()).toBe(404);
    // No demo state turns a hidden enrollment into another answer.
    for (const demoState of ['loading', 'error', 'forbidden']) {
      expect((await page.goto(`${SOMEONE_ELSE}?demoState=${demoState}`))?.status()).toBe(404);
      expect((await page.goto(`${SOMEONE_ELSE}/lessons/x?demoState=${demoState}`))?.status()).toBe(
        404,
      );
    }
    await page.goto('/learn/courses/demo-tenant-1-demo-user-enr-03');
    const otherCourseLesson = new URL(page.url()).pathname.split('/').at(-1)!;
    expect((await page.goto(`${MINE}/lessons/${otherCourseLesson}`))?.status()).toBe(404);
  });

  test('demo states: loading, error, forbidden', async ({ page }) => {
    await page.goto(`${MINE}?demoState=loading`);
    await expect(page.getByRole('status', { name: 'Loading…' })).toBeVisible();
    await page.goto(`${MINE}?demoState=error`);
    await expect(page.getByRole('alert').filter({ hasText: 'req_demo_0500' })).toBeVisible();
    await page.goto(`${MINE}?demoState=forbidden`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'You do not have access to this' }),
    ).toBeVisible();
  });

  test('360 px: no sideways scroll, lesson first, and Next stays in reach', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(MINE);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(pageOverflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole('button', { name: /Course content ·/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(page.getByRole('link', { name: /^Next lesson/ })).toBeInViewport();
    await expectNoAxeViolations(page);
  });
});
