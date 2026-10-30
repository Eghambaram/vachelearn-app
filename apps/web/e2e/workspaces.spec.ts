import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import {
  activate,
  apiPost,
  createAccount,
  expectNoAxeViolations,
  grantRole,
  signIn,
  uniqueEmail,
} from './real-users';

/*
 * Real sessions in the app shell (Slice 2.4d; D-089, D-096, D-097, D-037): platform staff set up a tenant and its first
 * admin through the real API, the admin lands in the right workspace, sees honest "not available yet" screens instead
 * of demo data, switches organisation, and staff open and end a support session with its banner.
 */

async function platformAdmin(page: Page) {
  const email = createAccount(uniqueEmail('staff'), 'E2E Staff (Demo)');
  grantRole(email, 'platform_super_admin');
  await activate(page, email);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/platform$/);
  return email;
}

async function createTenant(page: Page, label: string) {
  const slug = `e2e-${label}-${randomUUID().slice(0, 6)}`;
  const res = await apiPost(page, '/platform/tenants', {
    slug,
    displayName: `E2E ${label} (Demo)`,
    defaultTimezone: 'Asia/Kolkata',
  });
  expect(res.status).toBe(201);
  return { id: String(res.body!.id), slug, name: `E2E ${label} (Demo)` };
}

async function signOutFromMenu(page: Page) {
  await page.getByRole('button', { name: /account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login\?signedOut=1$/);
}

test.describe('real sessions in the app shell (Slice 2.4d)', () => {
  test('staff set up a tenant and its first admin; the admin lands in the admin workspace with no demo data', async ({
    page,
  }) => {
    await platformAdmin(page);
    // Platform staff land in the platform workspace; screens without an API say so (D-097).
    await expect(page.getByRole('heading', { level: 2, name: 'Not available yet' })).toBeVisible();
    await expect(page.getByText('Demo', { exact: true })).toHaveCount(0);
    await expectNoAxeViolations(page);

    const tenant = await createTenant(page, 'admin');
    const adminEmail = uniqueEmail('admin');
    const first = await apiPost(page, `/platform/tenants/${tenant.id}/first-admin`, {
      email: adminEmail,
      displayName: 'E2E Admin (Demo)',
    });
    expect(first.status).toBe(201);
    await signOutFromMenu(page);

    await activate(page, adminEmail);
    await signIn(page, adminEmail);
    // D-096: the Tenant Admin lands in the admin workspace.
    await expect(page).toHaveURL(/\/admin$/);
    // The screen keeps its own name as the page heading (UX review 2.4d).
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Not available yet' })).toBeVisible();
    await expect(page.getByText(/arrives in Phase 5/)).toBeVisible();
    await expectNoAxeViolations(page);
    await page.goto('/admin/courses');
    await expect(page.getByText('arrives in Phase 3', { exact: false })).toBeVisible();
    await signOutFromMenu(page);
  });

  test('a member of two organisations chooses one, then switches (D-089)', async ({ page }) => {
    await platformAdmin(page);
    const one = await createTenant(page, 'one');
    const two = await createTenant(page, 'two');
    const email = uniqueEmail('member');
    for (const tenant of [one, two]) {
      const res = await apiPost(page, `/platform/tenants/${tenant.id}/first-admin`, {
        email,
        displayName: 'E2E Member (Demo)',
      });
      expect(res.status).toBe(201);
    }
    await signOutFromMenu(page);

    await activate(page, email);
    await signIn(page, email);
    // Two organisations, none chosen: the picker.
    await expect(page).toHaveURL(/\/select-workspace$/);
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: one.name }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto('/select-workspace');
    await expect(page.getByRole('button', { name: one.name })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await page.getByRole('button', { name: two.name }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/select-workspace');
    await expect(page.getByRole('button', { name: two.name })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  test('staff open a read-only support session: banner, then end it (D-037)', async ({ page }) => {
    await platformAdmin(page);
    const tenant = await createTenant(page, 'support');
    // At 360 px the navigation sits behind the menu button.
    const menu = page.getByRole('button', { name: 'Open navigation menu' });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole('link', { name: 'Support sessions' }).first().click();
    await expect(page).toHaveURL(/\/platform\/support$/);
    await expectNoAxeViolations(page);

    // Nothing is preselected: submitting without choosing names the missing field.
    await page.getByRole('button', { name: 'Open support session' }).click();
    await expect(page.getByText('Choose the organisation to open.')).toBeVisible();
    await expect(page.getByLabel(/^Organisation/)).toBeFocused();
    await page.getByLabel(/^Organisation/).selectOption({ label: tenant.name });
    await page.getByLabel(/^Reason/).fill('E2E ticket: checking the setup');
    await page.getByRole('button', { name: 'Open support session' }).click();

    const banner = page.getByRole('region', { name: `Support session: ${tenant.name}` });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Read-only');
    // Focus moves to the banner once, so the change of mode is announced.
    await expect(banner).toBeFocused();
    await expectNoAxeViolations(page);
    // Writes are refused while in support, whatever the screen offers.
    const write = await apiPost(page, `/platform/tenants/${tenant.id}/suspend`, {
      reason: 'Not now',
    });
    expect(write.status).toBe(403);

    await banner.getByRole('button', { name: 'End support session' }).click();
    await expect(page.getByRole('region', { name: /Support session:/ })).toHaveCount(0);
    await expect(page).toHaveURL(/\/platform\/support\?ended=1$/);
    await expect(page.getByRole('status')).toContainText('Support session ended');
    await expect(page.getByRole('status')).toBeFocused();
    await expect(page.getByRole('button', { name: 'Open support session' })).toBeVisible();
  });
});
