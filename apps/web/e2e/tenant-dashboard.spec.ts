import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

async function useRole(context: BrowserContext, baseURL: string | undefined, role: string) {
  await context.addCookies([{ name: 'vl_demo_role', value: role, url: baseURL! }]);
}

const learners = (page: Page) => page.getByRole('group', { name: 'Learners' });

test.describe('Tenant Admin dashboard on demo data (Slice 1.5.2)', () => {
  test('tenant admin sees the whole organisation, labelled Demo', async ({
    page,
    context,
    baseURL,
  }) => {
    await useRole(context, baseURL, 'tenant_admin');
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText(/Scope: whole organisation/)).toBeVisible();
    for (const kpi of ['Learners', 'Published courses', 'Completion rate', 'Overdue enrollments']) {
      await expect(
        page.getByRole('group', { name: kpi }).locator('[data-slot="demo-badge"]'),
      ).toBeVisible();
    }
    await expect(learners(page)).toContainText('478');
    await expect(page.getByRole('heading', { level: 2, name: 'Learning progress' })).toBeVisible();
    await expect(page.getByText(/Compliance tracking arrives in Phase 5/)).toBeVisible();
    await expect(
      page
        .getByRole('list', { name: 'Course due dates in the next 30 days' })
        .getByRole('listitem'),
    ).toHaveCount(5);
    await expect(page.getByText('Example Learner 40')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('branch admin sees only Branch A1 (scope from the session)', async ({
    page,
    context,
    baseURL,
  }) => {
    await useRole(context, baseURL, 'branch_admin');
    await page.goto('/admin');
    await expect(page.getByText(/Scope: Example Branch A1/)).toBeVisible();
    await expect(learners(page)).toContainText('214');
    await expect(page.getByText('Example Branch A2')).toHaveCount(0);
    // A tampered query cannot widen scope.
    await page.goto('/admin?tenantId=demo-tenant-2&branchId=demo-tenant-1-branch-a2&scope=tenant');
    await expect(learners(page)).toContainText('214');
    await expect(page.getByText(/Scope: Example Branch A1/)).toBeVisible();
  });

  test('links appear only where the role may follow them', async ({ page, context, baseURL }) => {
    await useRole(context, baseURL, 'learning_manager');
    await page.goto('/admin');
    await expect(page.getByRole('link', { name: 'View audit log' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'View assignments' })).toBeVisible();
    await useRole(context, baseURL, 'compliance_viewer');
    await page.goto('/admin');
    await expect(page.getByRole('link', { name: 'View assignments' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'View audit log' })).toBeVisible();
  });

  test('period filter and tenant switch both recompute', async ({ page, context, baseURL }) => {
    // The switcher sits in the desktop sidebar; at 360 px it is in the drawer (covered by shell.spec.ts).
    await page.setViewportSize({ width: 1440, height: 900 });
    await useRole(context, baseURL, 'tenant_admin');
    await page.goto('/admin');
    await page.getByRole('combobox', { name: 'Period' }).click();
    await page.getByRole('option', { name: 'Last 90 days' }).click();
    await expect(page).toHaveURL(/period=90d/);
    await expect(learners(page)).toContainText('in 90 days');
    await page.getByRole('button', { name: /switch workspace/ }).click();
    await page.getByRole('menuitemradio', { name: 'Example Logistics (Demo)' }).click();
    await expect(page.getByRole('button', { name: /^Example Logistics \(Demo\)/ })).toBeVisible();
    await expect(learners(page)).toContainText('287');
  });

  test('loading, empty, error and forbidden states', async ({ page, context, baseURL }) => {
    await useRole(context, baseURL, 'tenant_admin');
    await page.goto('/admin?demoState=loading');
    await expect(learners(page)).toHaveAttribute('aria-busy', 'true');
    await page.goto('/admin?demoState=empty');
    await expect(page.getByRole('group', { name: 'Completion rate' })).toContainText(
      'No enrollments',
    );
    await expect(
      page.getByRole('heading', { name: 'Nothing due in the next 30 days' }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await page.goto('/admin?demoState=error');
    await expect(page.getByRole('alert').filter({ hasText: 'req_demo_0500' })).toBeVisible();
    await page.goto('/admin?demoState=forbidden');
    await expect(
      page.getByRole('heading', { level: 1, name: 'You do not have access to this' }),
    ).toBeVisible();
  });

  test('fits 360 px without sideways scrolling', async ({ page, context, baseURL }) => {
    await useRole(context, baseURL, 'branch_admin');
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/admin');
    await expect(learners(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
