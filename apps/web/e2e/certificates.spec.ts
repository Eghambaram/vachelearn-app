import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const CURRENT = '/learn/certificates/demo-tenant-1-demo-user-enr-07-cert-2';
const REVOKED = '/learn/certificates/demo-tenant-1-demo-user-enr-12-cert-1';
const SOMEONE_ELSE = '/learn/certificates/demo-tenant-1-demo-other-learner-enr-02-cert-1';

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

async function verificationIdOn(page: Page, path: string) {
  await page.goto(path);
  const href = await page
    .getByRole('link', { name: 'Open the verification page' })
    .getAttribute('href');
  return href!.split('/').at(-1)!;
}

test.describe('Certificates and public verification on demo data (Slice 1.5.7)', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: 'vl_demo_role', value: 'learner', url: baseURL! }]);
  });

  test('the dashboard leads to my certificates; each shows its status', async ({ page }) => {
    await page.goto('/learn');
    await page.getByRole('link', { name: 'View certificates' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'My certificates' })).toBeVisible();
    const list = page.getByRole('list', { name: 'Your certificates' });
    await expect(list.getByRole('listitem')).toHaveCount(5);
    for (const status of ['Valid', 'Superseded', 'Revoked', 'Expired']) {
      await expect(list.getByText(status, { exact: true }).first()).toBeVisible();
    }
    // Another learner's certificate never appears.
    await expect(page.getByText('Crane Signalling (Demo)')).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test('a certificate: demo preview, not-connected download, verification link', async ({
    page,
  }) => {
    await page.goto(CURRENT);
    await expect(
      page.getByRole('heading', { level: 1, name: 'First Aid Essentials (Demo)' }),
    ).toBeVisible();
    await expect(page.getByText('Demo preview — the PDF is the official copy.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Certificate preview' })).toContainText(
      'Demo User',
    );
    await page.getByRole('button', { name: 'Download PDF' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Nothing was downloaded.' }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole('link', { name: 'Open the verification page' }).click();
    await expect(page).toHaveURL(/\/verify\/VL(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
    await expect(page.getByText('This certificate is valid.')).toBeVisible();
  });

  test('someone else’s certificate is a 404 in every demo state', async ({ page }) => {
    for (const query of ['', '?demoState=loading', '?demoState=error', '?demoState=forbidden']) {
      expect((await page.goto(`${SOMEONE_ELSE}${query}`))?.status()).toBe(404);
    }
  });

  test('public verification shows minimal data: masked name, revoked date without reason', async ({
    page,
    context,
  }) => {
    const revokedId = await verificationIdOn(page, REVOKED);
    // The public page needs no session.
    await context.clearCookies();
    await page.goto(`/verify/${revokedId}`);
    await expect(page.locator('[data-slot="demo-badge"]')).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Certificate verification' }),
    ).toBeVisible();
    await expect(
      page.getByText(/This certificate was revoked on .*\. It is not valid\./),
    ).toBeVisible();
    await expect(page.getByText('D. U***')).toBeVisible();
    await expect(page.getByText('Demo User')).toHaveCount(0);
    await expect(page.getByText(/assessment record corrected/)).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test('lookup: typed ids are normalised; bad and unknown ids are explained', async ({ page }) => {
    const id = await verificationIdOn(page, CURRENT);
    await page.goto('/verify');
    await page.getByLabel('Certificate ID').fill(id.toLowerCase().replaceAll('-', ' '));
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page).toHaveURL(new RegExp(`/verify/${id}$`));
    await expect(page.getByText('This certificate is valid.')).toBeVisible();

    await page.goto('/verify?id=not-an-id');
    // Next's route announcer is also role=alert; pick ours by its text.
    await expect(
      page.getByRole('alert').filter({ hasText: 'That is not a certificate ID' }),
    ).toBeVisible();
    await expect(page.getByLabel('Certificate ID')).toHaveAttribute('aria-invalid', 'true');
    await expectNoAxeViolations(page);

    const response = await page.goto('/verify/VL-0000-0000-0000-0000');
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { level: 1, name: 'No certificate matches this ID' }),
    ).toBeVisible();
  });

  test('certificate list demo states: loading, empty, error, forbidden — labelled Demo', async ({
    page,
  }) => {
    await page.goto('/learn/certificates');
    await expect(page.locator('[data-slot="page-header"] [data-slot="demo-badge"]')).toBeVisible();
    await page.goto(CURRENT);
    await expect(page.locator('[data-slot="page-header"] [data-slot="demo-badge"]')).toBeVisible();
    await page.goto('/learn/certificates?demoState=loading');
    await expect(page.getByRole('status', { name: 'Loading…' })).toBeVisible();
    await page.goto('/learn/certificates?demoState=empty');
    await expect(page.getByRole('heading', { name: 'No certificates yet' })).toBeVisible();
    await page.goto('/learn/certificates?demoState=error');
    await expect(page.getByRole('alert').filter({ hasText: 'req_demo_0500' })).toBeVisible();
    await page.goto('/learn/certificates?demoState=forbidden');
    await expect(
      page.getByRole('heading', { level: 1, name: 'You do not have access to this' }),
    ).toBeVisible();
  });

  test('360 px: list, certificate and verification fit without sideways scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    const verifyPath = `/verify/${await verificationIdOn(page, CURRENT)}`;
    for (const path of ['/learn/certificates', CURRENT, '/verify', verifyPath]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    }
    await expectNoAxeViolations(page);
  });
});
