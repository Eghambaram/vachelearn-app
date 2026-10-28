import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { E2E_API_ENV } from '../playwright.config';

/*
 * Authentication end to end (Slice 2.3d): the real API (playwright.config.ts starts it), real email through Mailpit,
 * the browser going through this app's /api/v1 proxy (D-085). Playwright runs from apps/web, so the command path is
 * resolved from there. Alerts are looked up inside `main`: Next's route announcer is also a `role="alert"`. Accounts are created with the operator command (D-083)
 * and every address is unique, so runs never collide.
 */

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:58025';
const PASSWORD = 'a long and private passphrase';

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

function createAccount() {
  const email = `e2e-${randomUUID().slice(0, 8)}@example.test`;
  execFileSync(
    'node',
    [
      resolve(process.cwd(), '../api/dist/src/cli/create-user.js'),
      '--email',
      email,
      '--name',
      'E2E Learner (Demo)',
      '--reason',
      'Playwright end-to-end test',
    ],
    { env: { ...process.env, ...E2E_API_ENV }, stdio: 'pipe' },
  );
  return email;
}

/** The newest link Mailpit received for an address (waits for the email to arrive). */
async function latestLink(email: string, count = 1) {
  let link = '';
  await expect
    .poll(
      async () => {
        const search = await fetch(
          `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
        );
        const { messages } = (await search.json()) as { messages: { ID: string }[] };
        if (messages.length < count) return 0;
        const message = (await (
          await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0]!.ID}`)
        ).json()) as {
          Text: string;
        };
        link = /https?:\/\/\S+#token=[A-Za-z0-9_-]{43}/.exec(message.Text)?.[0] ?? '';
        return messages.length;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThanOrEqual(count);
  return link;
}

async function choosePassword(page: Page, link: string, password = PASSWORD) {
  await page.goto(link);
  await page.getByLabel(/^New password/).fill(password);
  await page.getByLabel(/^Repeat the new password/).fill(password);
  await page.getByRole('button', { name: 'Save the password' }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    /Your password is (saved|changed)/,
  );
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel(/^Email address/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('authentication (Slice 2.3d)', () => {
  test('a new account sets its password from the emailed link, signs in and signs out', async ({
    page,
  }) => {
    const email = createAccount();
    const link = await latestLink(email);
    expect(link).toMatch(/\/set-password#token=/);

    await page.goto(link);
    await expect(page.getByRole('heading', { level: 1, name: 'Set your password' })).toBeVisible();
    // The token is read once and removed from the address bar.
    await expect(page).toHaveURL(/\/set-password$/);
    await expectNoAxeViolations(page);
    await choosePassword(page, link);

    await signIn(page, email);
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByText(email)).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login\?signedOut=1$/);
    await expect(page.getByRole('main').getByRole('status')).toHaveText('You are signed out.');
    await page.goto('/welcome');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a wrong password shows one message; forgot password sends a reset link that works once', async ({
    page,
  }) => {
    const email = createAccount();
    await choosePassword(page, await latestLink(email));

    await signIn(page, email, 'not the right passphrase');
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'Email or password is incorrect.',
    );
    // Focus returns to the (cleared) password field, ready for another try.
    await expect(page.getByLabel(/^Password/)).toBeFocused();
    await expect(page.getByLabel(/^Password/)).toHaveValue('');
    await expectNoAxeViolations(page);

    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expectNoAxeViolations(page);
    await page.getByLabel(/^Email address/).fill(email);
    await page.getByRole('button', { name: 'Send the link' }).click();
    await expect(page.getByRole('main').getByRole('status')).toContainText(
      'If an account exists for that address',
    );
    await expect(page.getByRole('main').getByRole('status')).toBeFocused();
    await expectNoAxeViolations(page);

    const reset = await latestLink(email, 2);
    expect(reset).toMatch(/\/reset-password#token=/);
    await choosePassword(page, reset, 'a brand new passphrase');
    // Used once: opening it again offers a new link instead of the form. (Leave the page first: a link that differs
    // only in its fragment is an in-page navigation.)
    await page.goto('/login');
    await page.goto(reset);
    await page.getByLabel(/^New password/).fill('yet another passphrase');
    await page.getByLabel(/^Repeat the new password/).fill('yet another passphrase');
    await page.getByRole('button', { name: 'Save the password' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'expired or was already used',
    );

    await signIn(page, email, 'a brand new passphrase');
    await expect(page).toHaveURL(/\/welcome$/);
  });

  test('the sign-in and forgot pages are labelled and accessible; a link without a token asks for a new one', async ({
    page,
  }) => {
    await page.goto('/login');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Sign in to VacheLearn' }),
    ).toBeVisible();
    await expect(page.getByLabel(/^Email address/)).toHaveAttribute('autocomplete', 'username');
    await expectNoAxeViolations(page);

    await page.goto('/set-password');
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'needs the link from your email',
    );
    await expect(page.getByRole('link', { name: 'Ask for a new link' })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('pages carry the security headers; secret-link pages send no referrer and are not cached', async ({
    request,
  }) => {
    const home = await request.get('/');
    expect(home.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(home.headers()['x-frame-options']).toBe('DENY');
    expect(home.headers()['x-content-type-options']).toBe('nosniff');
    expect(home.headers()['cross-origin-opener-policy']).toBe('same-origin');
    const setPage = await request.get('/set-password');
    expect(setPage.headers()['referrer-policy']).toBe('no-referrer');
    expect(setPage.headers()['cache-control']).toContain('no-store');
    // The API answers through this origin (D-085).
    expect((await request.get('/api/v1/auth/me')).status()).toBe(401);
  });
});
