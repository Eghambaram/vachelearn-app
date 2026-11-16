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
 * Groups on the real API (Slice 3.2; spec §5 ACs; D-119–D-122): a Tenant Admin creates a branch group, adds a person of
 * that branch, invites someone into the group, removes the member with a reason (kept in the history), and archives the
 * group. A Branch Admin of another branch never sees it. Runs at desktop width and at 360 px (Playwright projects).
 */

test('a Tenant Admin creates a group, manages members with history, and archives it', async ({
  page,
}) => {
  test.slow();
  const { slug, admin } = await tenantWithAdmin(page, 'groups');
  await activate(page, admin);
  await signIn(page, admin);
  await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });
  for (const [code, name] of [
    ['PUN', 'Pune'],
    ['NGP', 'Nagpur'],
  ]) {
    const branch = await apiPost(page, '/branches', { code, name, timezone: 'Asia/Kolkata' });
    expect(branch.status).toBe(201);
  }
  // A learner of Pune (created by the operator CLI; they need not sign in), and a Branch Admin of Nagpur.
  const learner = createAccount(uniqueEmail('learner'), 'Asha Patel (Demo)');
  grantRole(learner, 'learner', slug, 'PUN');
  const nagpurAdmin = createAccount(uniqueEmail('ba'), 'Nagpur Admin (Demo)');
  grantRole(nagpurAdmin, 'branch_admin', slug, 'NGP');

  await page.goto('/admin/groups');
  await expect(page.getByRole('heading', { level: 1, name: 'Groups' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No groups yet' })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole('link', { name: 'Create group' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Create a group' })).toBeVisible();
  await expect(page.getByLabel(/^Name/)).toBeFocused();
  // Client checks first, focused on the first problem.
  await page.getByRole('button', { name: 'Create group' }).click();
  await expect(page.getByLabel(/^Name/)).toBeFocused();
  await page.getByLabel(/^Name/).fill('Night shift');
  await page.getByLabel(/^Description/).fill('Forklift operators on nights');
  await page.getByLabel(/^Who can be in it/).click();
  await expect(page.getByRole('option', { name: 'Whole organisation' })).toBeVisible();
  await page.getByRole('option', { name: 'Branch: Pune (PUN)' }).click();
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Create group' }).click();

  await expect(page).toHaveURL(/\/admin\/groups\/[0-9a-f-]+\?created=1$/);
  const main = page.getByRole('main');
  await expect(page.getByRole('heading', { level: 1, name: 'Night shift' })).toBeVisible();
  await expect(main.getByRole('status').filter({ hasText: 'Group created.' })).toBeVisible();
  await expect(main.getByText('Only people of Pune can join this group.')).toBeVisible();
  await expectNoAxeViolations(page);

  // Add the Pune learner.
  await main.getByLabel(/^Find a person/).fill('Asha');
  await main.getByRole('button', { name: 'Add Asha Patel (Demo)' }).click();
  await expect(
    main.getByRole('status').filter({ hasText: 'Asha Patel (Demo) added to the group.' }),
  ).toBeVisible();
  const members = main.getByRole('table', { name: /Group members/ });
  await expect(members.getByRole('row', { name: /Asha Patel/ })).toBeVisible();
  await expectNoAxeViolations(page);

  // Invite someone straight into the group (D-122).
  const groupUrl = page.url().replace('?created=1', '');
  await page.goto('/admin/invitations/new');
  const invitee = uniqueEmail('invitee');
  await page.getByLabel(/^Email address/).fill(invitee);
  await page.getByLabel(/^Role/).click();
  await page.getByRole('option', { name: 'Learner' }).click();
  await page.getByLabel(/^Where/).click();
  await page.getByRole('option', { name: 'Pune (PUN)' }).click();
  await page.getByLabel(/^Group/).click();
  await page.getByRole('option', { name: 'Night shift' }).click();
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Send the invitation' }).click();
  await expect(page).toHaveURL(/\/admin\/invitations\?sent=/);
  await expect(page.getByRole('row', { name: new RegExp(invitee) })).toContainText(
    'Group: Night shift',
  );

  // Remove with a reason: the history keeps it.
  await page.goto(groupUrl);
  await main.getByRole('button', { name: 'Remove Asha Patel (Demo)' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Remove Asha Patel (Demo)?' });
  await dialog.getByLabel(/^Reason/).fill('Moved to day shift');
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await expect(main.getByRole('status').filter({ hasText: 'Member removed.' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'No members yet' })).toBeVisible();
  await main.getByRole('combobox', { name: 'Status' }).click();
  await page.getByRole('option', { name: 'Removed' }).click();
  await expect(main.locator('tbody')).toContainText('Moved to day shift');
  await expectNoAxeViolations(page);

  // Archive: history kept, no adding.
  await main.getByRole('button', { name: 'Archive group' }).click();
  const archive = page.getByRole('alertdialog', { name: 'Archive Night shift?' });
  await archive.getByLabel(/^Reason/).fill('Night shift paused');
  await archive.getByRole('button', { name: 'Archive group' }).click();
  await expect(main.getByRole('status').filter({ hasText: 'Group archived.' })).toBeVisible();
  await expect(main.getByText('Reason: Night shift paused')).toBeVisible();
  await expect(main.getByText(/This group is archived/)).toBeVisible();
  await expect(main.getByLabel(/^Find a person/)).toHaveCount(0);
  await expectNoAxeViolations(page);

  await page.goto('/admin/groups');
  await expect(page.getByRole('row', { name: /Night shift/ })).toContainText('Archived');

  // The Branch Admin of Nagpur never sees the Pune group: not in the list, and its page is "not found".
  await page.context().clearCookies();
  await activate(page, nagpurAdmin);
  await signIn(page, nagpurAdmin);
  await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });
  await page.goto('/admin/groups');
  await expect(page.getByRole('heading', { name: 'No groups yet' })).toBeVisible();
  await page.goto(groupUrl);
  await expect(page.getByRole('heading', { level: 1, name: 'Group not found' })).toBeVisible();
  await expectNoAxeViolations(page);
});
