import { expect, test } from '@playwright/test';
import {
  activate,
  apiPost,
  createAccount,
  expectNoAxeViolations,
  grantRole,
  signIn,
  tenantWithAdmin,
  uniqueEmail,
} from './real-users';

/*
 * Users on the real API (Slice 2.5b; D-047, D-101–D-107): a Tenant Admin finds a member, edits the organisation's
 * fields, deactivates and reactivates them with a reason, adds a branch and makes it primary, assigns and revokes a
 * role — each confirmed by the API's answer on the re-rendered page — and reads the roles reference.
 */

test('a Tenant Admin manages a member’s details, status, branches and roles', async ({ page }) => {
  test.slow();
  const { slug, admin } = await tenantWithAdmin(page, 'people');
  await activate(page, admin);
  await signIn(page, admin);
  await expect(page).toHaveURL(/\/admin$/);
  for (const code of ['A1', 'A2']) {
    const res = await apiPost(page, '/branches', {
      code,
      name: `Site ${code} (Demo)`,
      timezone: 'Asia/Kolkata',
    });
    expect(res.status).toBe(201);
  }
  const learner = createAccount(uniqueEmail('learner'), 'E2E Learner (Demo)');
  grantRole(learner, 'learner', slug, 'A1');

  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
  await page.getByLabel('Search users').fill('E2E Learner');
  const link = page.getByRole('link', { name: 'E2E Learner (Demo)' });
  await expect(link).toBeVisible();
  await expect(page.getByRole('row', { name: /E2E Admin/ })).toHaveCount(0);
  await expectNoAxeViolations(page);
  await link.click();
  await expect(page.getByRole('heading', { level: 1, name: 'E2E Learner (Demo)' })).toBeVisible();
  await expectNoAxeViolations(page);

  // Organisation fields (D-047).
  const details = page.getByRole('region', { name: 'Organisation details' });
  await details.getByRole('button', { name: 'Edit details' }).click();
  await expect(details.getByLabel(/^Employee ID/)).toBeFocused();
  await details.getByLabel(/^Employee ID/).fill('E-2001');
  await details.getByLabel(/^Department/).fill('Fabrication');
  await details.getByRole('button', { name: 'Save details' }).click();
  await expect(details.getByRole('status')).toHaveText('Details saved.');
  await expect(details).toContainText('Fabrication');
  // Cancelling an edit returns focus to "Edit details" (WCAG 2.4.3).
  await details.getByRole('button', { name: 'Edit details' }).click();
  await details.getByRole('button', { name: 'Cancel' }).click();
  await expect(details.getByRole('button', { name: 'Edit details' })).toBeFocused();

  // Status with a reason (D-102).
  const status = page.getByRole('region', { name: 'Status' });
  await status.getByRole('button', { name: 'Deactivate user' }).click();
  const dialog = page.getByRole('alertdialog', { name: /Deactivate E2E Learner/ });
  await dialog.getByRole('button', { name: 'Deactivate user' }).click();
  await expect(dialog.getByText('Enter a reason of at least 3 characters.')).toBeVisible();
  await dialog.getByLabel(/^Reason/).fill('Left the site');
  await dialog.getByRole('button', { name: 'Deactivate user' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(status.getByRole('status')).toContainText('User deactivated');
  // Focus lands on the result, not on the page body (WCAG 2.4.3).
  await expect(status.getByRole('status')).toBeFocused();
  await expect(status).toContainText('Reason: Left the site');
  await status.getByRole('button', { name: 'Reactivate user' }).click();
  const back = page.getByRole('alertdialog', { name: /Reactivate E2E Learner/ });
  await back.getByLabel(/^Reason/).fill('Returned to work');
  await back.getByRole('button', { name: 'Reactivate user' }).click();
  await expect(status.getByRole('status')).toHaveText('User reactivated.');

  // Branches (D-026, D-104).
  const branches = page.getByRole('region', { name: 'Branches' });
  await branches.getByLabel('Branch to add').click();
  await page.getByRole('option', { name: 'Site A2 (Demo) (A2)' }).click();
  await branches.getByRole('button', { name: 'Add to branch' }).click();
  await expect(branches.getByRole('status')).toHaveText('Branch added.');
  await branches.getByRole('button', { name: 'Make primary (Site A2 (Demo))' }).click();
  await expect(branches.getByRole('status')).toHaveText('Primary branch changed.');
  // A live role on A1 keeps them there until it is revoked.
  await branches.getByRole('button', { name: 'Remove (Site A1 (Demo))' }).click();
  await page
    .getByRole('alertdialog', { name: 'Remove E2E Learner (Demo) from Site A1 (Demo)?' })
    .getByRole('button', { name: 'Remove from branch' })
    .click();
  await expect(branches.getByRole('alert')).toHaveText('Revoke their roles on this branch first.');
  await expect(branches.getByRole('alert')).toBeFocused();

  // Roles (D-107).
  const roles = page.getByRole('region', { name: 'Roles' });
  await roles.getByLabel(/^Role/).click();
  await page.getByRole('option', { name: 'Instructor' }).click();
  await roles.getByLabel(/^Where/).click();
  await page.getByRole('option', { name: 'Site A2 (Demo) (A2)' }).click();
  await roles.getByRole('button', { name: 'Assign role' }).click();
  await expect(roles.getByRole('status')).toHaveText('Role assigned.');
  await roles.getByRole('button', { name: 'Revoke (Instructor, Site A2 (Demo))' }).click();
  const revoke = page.getByRole('alertdialog', {
    name: 'Revoke Instructor (Site A2 (Demo)) from E2E Learner (Demo)?',
  });
  await revoke.getByLabel(/^Reason/).fill('Assigned by mistake');
  await revoke.getByRole('button', { name: 'Revoke role' }).click();
  await expect(roles.getByRole('status')).toHaveText('Role revoked.');
  // The revoked row and its trigger are gone: focus is on the result message.
  await expect(roles.getByRole('status')).toBeFocused();
  await expectNoAxeViolations(page);

  await page.goto('/admin/roles');
  await expect(page.getByRole('heading', { level: 1, name: 'Roles' })).toBeVisible();
  await expectNoAxeViolations(page);

  // Every change above is in the organisation's audit log (Slice 2.6a), newest first, with its reason.
  await page.goto('/admin/audit');
  await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();
  const log = page.getByRole('table', { name: 'Audit log' });
  await expect(log.getByRole('row').nth(1)).toContainText('Revoked a role');
  await expect(log).toContainText('Reason: Left the site');
  await expect(log).toContainText('Deactivated a member');
  await expectNoAxeViolations(page);
});
