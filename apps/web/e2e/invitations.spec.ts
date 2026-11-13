import { expect, test } from '@playwright/test';
import {
  activate,
  expectNoAxeViolations,
  latestLink,
  PASSWORD,
  signIn,
  tenantWithAdmin,
  uniqueEmail,
} from './real-users';

/*
 * Invitations on the real API (Slice 3.1; spec §5; D-050, D-116): a Tenant Admin invites a new person, resends the
 * invitation (the first link stops working), the person accepts through the emailed link, chooses a password, signs in
 * and lands in their workspace; the used link then fails, and the list shows the invitation as accepted.
 */

test('a Tenant Admin invites a new person, who accepts and signs in', async ({ page, browser }) => {
  test.slow();
  const { admin } = await tenantWithAdmin(page, 'invite');
  await activate(page, admin);
  await signIn(page, admin);
  await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });

  await page.goto('/admin/invitations');
  await expect(page.getByRole('heading', { level: 1, name: 'Invitations' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No invitations yet' })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole('link', { name: 'Invite a person' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Invite a person' })).toBeVisible();
  await expect(page.getByLabel(/^Email address/)).toBeFocused();
  await expect(page.getByText(/expires after 7 days/)).toBeVisible();
  // Client checks first, focused on the first problem.
  await page.getByRole('button', { name: 'Send the invitation' }).click();
  await expect(page.getByLabel(/^Email address/)).toBeFocused();
  const invitee = uniqueEmail('invitee');
  await page.getByLabel(/^Email address/).fill(invitee);
  await page.getByLabel(/^Role/).click();
  await page.getByRole('option', { name: 'Learner' }).click();
  await page.getByLabel(/^Where/).click();
  await page.getByRole('option', { name: 'Whole organisation' }).click();
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Send the invitation' }).click();

  await expect(page).toHaveURL(/\/admin\/invitations\?sent=/);
  await expect(
    page.getByRole('status').filter({ hasText: `Invitation sent to ${invitee}.` }),
  ).toBeVisible();
  const row = page.getByRole('row', { name: new RegExp(invitee) });
  await expect(row).toContainText('Pending');
  const firstLink = await latestLink(invitee);

  // A resend replaces the link: the first one stops working.
  await row.getByRole('button', { name: /^Resend/ }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'The earlier link no longer works.' }),
  ).toBeVisible();
  const secondLink = await latestLink(invitee, 2);
  expect(secondLink).not.toBe(firstLink);
  await expectNoAxeViolations(page);

  // The invited person, in their own browser.
  const context = await browser.newContext();
  const person = await context.newPage();
  await person.goto(firstLink);
  await expect(person.getByRole('main').getByRole('alert')).toContainText(
    'invalid, used or expired',
  );

  await person.goto(secondLink);
  await expect(
    person.getByRole('heading', { level: 1, name: 'Accept your invitation' }),
  ).toBeVisible();
  await expect(person.getByText(/You are invited to join E2E invite/)).toBeVisible();
  // The token leaves the address bar as soon as the page reads it.
  expect(person.url()).not.toContain('#token=');
  await expectNoAxeViolations(person);
  await person.getByLabel(/^Your name/).fill('Meera Iyer (Demo)');
  await person.getByLabel(/^Choose a password/).fill(PASSWORD);
  await person.getByLabel(/^Repeat the password/).fill(PASSWORD);
  await person.getByRole('button', { name: 'Accept and create my account' }).click();
  await expect(person.getByRole('main').getByRole('status')).toContainText('Your account is ready');
  await expect(person.getByRole('main').getByRole('status')).toBeFocused();

  // The link never opens a session (D-116): the person signs in.
  await person.getByRole('link', { name: 'Sign in' }).click();
  await signIn(person, invitee);
  await expect(person).toHaveURL(/\/learn/, { timeout: 20_000 });

  // Used once.
  await person.context().clearCookies();
  await person.goto(secondLink);
  await expect(person.getByRole('main').getByRole('alert')).toContainText(
    'invalid, used or expired',
  );
  await context.close();

  await page.reload();
  await expect(page.getByRole('row', { name: new RegExp(invitee) })).toContainText('Accepted');
});
