import { expect, test, type Page } from '@playwright/test';
import { demoEmail, expectNoAxeViolations, signIn } from './real-users';

/*
 * Per-role smoke on the seeded demo data (Slice 2.6c, D-108): every seeded account signs in through the UI and lands in
 * the workspace of its most capable role (D-096), with its organisation, role and scope shown; the person in two
 * organisations chooses one and switches (D-089); a Tenant Admin sees the whole organisation's people and a Branch
 * Admin only its branch's. The seed runs once in the `seed` setup project (e2e/seed.setup.ts).
 */

const MANUFACTURING = 'Demo Manufacturing Co';

const ACCOUNTS = [
  { local: 'admin', role: 'Tenant Admin', scope: 'Whole organisation', home: '/admin' },
  { local: 'branch-admin', role: 'Branch Admin', scope: 'Demo Plant Pune', home: '/admin' },
  {
    local: 'learning-manager',
    role: 'Learning Manager',
    scope: 'Whole organisation',
    home: '/admin',
  },
  { local: 'compliance', role: 'Compliance Viewer', scope: 'Whole organisation', home: '/admin' },
  { local: 'instructor', role: 'Instructor', scope: 'Demo Plant Pune', home: '/instructor' },
  { local: 'learner', role: 'Learner', scope: 'Demo Plant Pune', home: '/learn' },
  { local: 'learner2', role: 'Learner', scope: 'Demo Plant Houston', home: '/learn' },
] as const;

/** The workspace switcher's "<role> · <scope>" line; at 360 px it sits behind the navigation menu. */
async function expectWorkspace(page: Page, organisation: string, role: string, scope: string) {
  const menu = page.getByRole('button', { name: 'Open navigation menu' });
  const drawer = await menu.isVisible();
  if (drawer) await menu.click();
  const shown = (text: string) =>
    page.getByText(text, { exact: true }).filter({ visible: true }).first();
  await expect(shown(organisation)).toBeVisible();
  await expect(shown(`${role} · ${scope}`)).toBeVisible();
  if (drawer) await page.keyboard.press('Escape');
}

test.describe('seeded demo accounts, one per role (Slice 2.6c)', () => {
  for (const account of ACCOUNTS) {
    test(`${account.role} (${account.scope}) signs in and lands in ${account.home}`, async ({
      page,
    }) => {
      await signIn(page, demoEmail(`${account.local}.demo-manufacturing`));
      await expect(page).toHaveURL(new RegExp(`${account.home}$`));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectWorkspace(page, MANUFACTURING, account.role, account.scope);
      await expectNoAxeViolations(page);
    });
  }

  test('the platform admin lands in the platform workspace', async ({ page }) => {
    await signIn(page, demoEmail('platform-admin'));
    await expect(page).toHaveURL(/\/platform$/);
    await expectWorkspace(page, 'Platform administration', 'Platform Super Admin', 'Platform');
  });

  test('the person in both organisations chooses one, then switches (D-089)', async ({ page }) => {
    await signIn(page, demoEmail('both-tenants'));
    await expect(page).toHaveURL(/\/select-workspace$/);
    await page.getByRole('button', { name: MANUFACTURING }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expectWorkspace(page, MANUFACTURING, 'Learning Manager', 'Whole organisation');

    await page.goto('/select-workspace');
    await page.getByRole('button', { name: 'Demo Logistics Ltd' }).click();
    await expect(page).toHaveURL(/\/learn$/);
    await expectWorkspace(page, 'Demo Logistics Ltd', 'Learner', 'Demo Depot Chennai');
  });

  test('a Tenant Admin sees every branch’s people; a Branch Admin only its own branch (D-101)', async ({
    page,
  }) => {
    const visible = (name: string) =>
      page.getByText(name, { exact: true }).filter({ visible: true });

    await signIn(page, demoEmail('admin.demo-manufacturing'));
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/admin/users');
    await expect(visible('Manufacturing learner (Demo)')).toHaveCount(1);
    await expect(visible('Manufacturing learner two (Demo)')).toHaveCount(1);
    // The other organisation's people never appear.
    await expect(visible('Logistics learner (Demo)')).toHaveCount(0);
    await page.context().clearCookies();

    await signIn(page, demoEmail('branch-admin.demo-manufacturing'));
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/admin/users');
    await expect(visible('Manufacturing learner (Demo)')).toHaveCount(1);
    // Houston's learner is outside the Pune Branch Admin's scope.
    await expect(visible('Manufacturing learner two (Demo)')).toHaveCount(0);
    await expect(visible('Logistics learner (Demo)')).toHaveCount(0);
  });
});
