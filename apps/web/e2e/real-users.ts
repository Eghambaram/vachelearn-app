import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { E2E_API_ENV } from '../playwright.config';

/*
 * Real accounts for end-to-end tests (the API on :4100, Mailpit): created and granted with the operator commands
 * (D-083, `user:grant`), activated through the emailed link, signed in through the UI. Playwright runs from apps/web.
 */

export const PASSWORD = 'a long and private passphrase';
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:58025';
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

export const uniqueEmail = (prefix = 'e2e') => `${prefix}-${randomUUID().slice(0, 8)}@example.test`;

function cli(script: string, args: string[]) {
  execFileSync('node', [resolve(process.cwd(), `../api/dist/src/cli/${script}.js`), ...args], {
    env: { ...process.env, ...E2E_API_ENV },
    stdio: 'pipe',
  });
}

export function createAccount(email = uniqueEmail(), name = 'E2E Person (Demo)') {
  cli('create-user', ['--email', email, '--name', name, '--reason', 'Playwright end-to-end test']);
  return email;
}

export function grantRole(email: string, role: string, tenantSlug?: string) {
  cli('grant-role', [
    '--email',
    email,
    '--role',
    role,
    ...(tenantSlug ? ['--tenant', tenantSlug] : []),
    '--reason',
    'Playwright end-to-end test',
  ]);
}

/** The newest link Mailpit received for an address (waits for the email to arrive). */
export async function latestLink(email: string, count = 1) {
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

export async function activate(page: Page, email: string) {
  await page.goto(await latestLink(email));
  await page.getByLabel(/^New password/).fill(PASSWORD);
  await page.getByLabel(/^Repeat the new password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Save the password' }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText(/Your password is/);
}

export async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel(/^Email address/).fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** A state-changing API call from inside the signed-in page (same origin, the session's CSRF token). */
export async function apiPost(page: Page, path: string, body: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const me = (await (await fetch('/api/v1/auth/me')).json()) as { csrfToken: string };
      const res = await fetch(`/api/v1${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrfToken },
        body: JSON.stringify(body),
      });
      return {
        status: res.status,
        body: (await res.json().catch(() => null)) as Record<string, unknown> | null,
      };
    },
    { path, body },
  );
}
