import { expect, test } from '@playwright/test';
import {
  activate,
  createAccount,
  expectNoAxeViolations,
  grantRole,
  signIn,
  tenantWithAdmin,
  uniqueEmail,
} from './real-users';

/*
 * Branches, settings and job roles on the real API (Slice 2.5c; UI spec #16, #30, #53; D-047): a Tenant Admin adds a
 * branch (the organisation's time zone preselected), edits and deactivates it, renames the organisation, and manages
 * the job-role list — each confirmed by the API's answer on the re-rendered page.
 */

test('a Tenant Admin manages branches, settings and job roles', async ({ page }) => {
  test.slow();
  const { admin, slug } = await tenantWithAdmin(page, 'tenancy');
  await activate(page, admin);
  await signIn(page, admin);
  await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });

  // Branches (#16).
  await page.goto('/admin/branches');
  await expect(page.getByRole('heading', { level: 1, name: 'Branches' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No branches yet' })).toBeVisible();
  await expectNoAxeViolations(page);
  // Both the header and the empty list offer it.
  await expect(page.getByRole('link', { name: 'Add branch' })).toHaveCount(2);
  await page.getByRole('link', { name: 'Add branch' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add a branch' })).toBeVisible();
  await expect(page.getByLabel(/^Code/)).toBeFocused();
  // Client checks first, focused on the first problem.
  await page.getByRole('button', { name: 'Add branch' }).click();
  await expect(page.getByLabel(/^Code/)).toBeFocused();
  await page.getByLabel(/^Code/).fill('pune-1');
  await page.getByLabel(/^Name/).fill('Pune Plant (Demo)');
  await page.getByLabel(/^Country code/).fill('in');
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Add branch' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Pune Plant (Demo)' })).toBeVisible();
  // The new branch's page confirms it, focused (the form is gone).
  await expect(page.getByRole('status')).toHaveText('Branch added.');
  await expect(page.getByRole('status')).toBeFocused();
  await expect(page.getByText('PUNE-1').first()).toBeVisible();
  await expect(page.getByText('Asia/Kolkata'.replace('_', ' '))).toBeVisible();

  const details = page.getByRole('region', { name: 'Branch details' });
  await details.getByRole('button', { name: 'Edit details' }).click();
  await expect(details.getByLabel(/^Name/)).toBeFocused();
  await details.getByLabel(/^City/).fill('Pune');
  await details.getByRole('button', { name: 'Save details' }).click();
  await expect(details.getByRole('status')).toHaveText('Branch details saved.');
  await expect(details.getByRole('status')).toBeFocused();
  await expect(details).toContainText('Pune');

  const status = page.getByRole('region', { name: 'Status' });
  await status.getByRole('button', { name: 'Deactivate branch' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Deactivate Pune Plant (Demo)?' });
  await dialog.getByLabel(/^Reason/).fill('Site closed for refit');
  await dialog.getByRole('button', { name: 'Deactivate branch' }).click();
  await expect(status.getByRole('status')).toHaveText('Branch deactivated.');
  await expect(status.getByRole('status')).toBeFocused();
  await expect(status).toContainText('Reason: Site closed for refit');
  await expectNoAxeViolations(page);

  // A second branch with the same code is refused on the code field.
  await page.goto('/admin/branches/new');
  await page.getByLabel(/^Code/).fill('PUNE-1');
  await page.getByLabel(/^Name/).fill('Another (Demo)');
  await page.getByRole('button', { name: 'Add branch' }).click();
  await expect(page.getByLabel(/^Code/)).toHaveAccessibleDescription(/already|uses this code/);
  await expect(page.getByLabel(/^Code/)).toBeFocused();

  // General settings (#30).
  await page.goto('/admin/settings');
  await expect(page.getByRole('link', { name: 'General' })).toHaveAttribute('aria-current', 'page');
  const general = page.getByRole('region', { name: 'General' });
  await general.getByRole('button', { name: 'Edit settings' }).click();
  await general.getByLabel(/^Organisation name/).fill('E2E Renamed Works (Demo)');
  await general.getByLabel(/^Language and region/).fill('en-gb');
  await general.getByRole('button', { name: 'Save settings' }).click();
  await expect(general.getByRole('status')).toHaveText('Settings saved.');
  await expect(general).toContainText('E2E Renamed Works (Demo)');
  await expect(general).toContainText('en-GB');
  await expect(page.getByRole('region', { name: 'Features' })).toContainText('Off');
  await expectNoAxeViolations(page);

  // Job roles (#53).
  await page.getByRole('link', { name: 'Job roles' }).click();
  await expect(page).toHaveURL(/\/admin\/settings\/people$/);
  await page.getByLabel(/^Name/).fill('Welder');
  await page.getByRole('button', { name: 'Add job role' }).click();
  await expect(page.getByRole('status')).toHaveText('Job role added.');
  await page.getByLabel(/^Name/).fill('welder');
  await page.getByRole('button', { name: 'Add job role' }).click();
  await expect(page.getByLabel(/^Name/)).toHaveAccessibleDescription(/already has a job role/);
  await page.getByRole('button', { name: 'Rename (Welder)' }).click();
  await page.getByLabel(/^Rename Welder/).fill('Senior welder');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('status')).toHaveText('Job role renamed.');
  await page.getByRole('button', { name: 'Deactivate (Senior welder)' }).click();
  const off = page.getByRole('alertdialog', { name: 'Deactivate Senior welder?' });
  await off.getByLabel(/^Reason/).fill('Merged into Welder grades');
  await off.getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.getByRole('status')).toHaveText('Job role deactivated.');
  await expect(page.getByRole('listitem').filter({ hasText: 'Senior welder' })).toContainText(
    'Inactive',
  );
  await expectNoAxeViolations(page);

  // A read-only viewer (Compliance Viewer): the same screens, no way to change anything (no dead buttons).
  const viewer = createAccount(uniqueEmail('viewer'), 'E2E Viewer (Demo)');
  grantRole(viewer, 'compliance_viewer', slug);
  await page.context().clearCookies();
  await activate(page, viewer);
  await signIn(page, viewer);
  await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });
  await page.goto('/admin/branches');
  await expect(page.getByRole('link', { name: 'Pune Plant (Demo)' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add branch' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Pune Plant (Demo)' }).click();
  await expect(page.getByText('Only a Tenant Admin can change branches.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Edit details|Reactivate branch/ })).toHaveCount(0);
  await page.goto('/admin/settings/people');
  await expect(page.getByText('Only a Tenant Admin can change job roles.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Rename|Deactivate|Reactivate|Add job role/ }),
  ).toHaveCount(0);
  await expectNoAxeViolations(page);
});
