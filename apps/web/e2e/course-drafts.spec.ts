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
 * Categories, tags and course drafts on the real API (Slice 3.3; spec §6; D-127–D-130): a Tenant Admin adds a category
 * and a tag, creates a course, fills in its basics and saves; a save made meanwhile elsewhere makes the next save a 409
 * with a reload path, and nothing is overwritten. A Branch Admin reads the draft without editing it. Runs at desktop
 * width and at 360 px (Playwright projects).
 */

test('a Tenant Admin authors a course draft; a stale save offers a reload; a Branch Admin reads it', async ({
  page,
}) => {
  test.slow();
  const { slug, admin } = await tenantWithAdmin(page, 'courses');
  await activate(page, admin);
  await signIn(page, admin);
  await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });
  expect(
    (await apiPost(page, '/branches', { code: 'PUN', name: 'Pune', timezone: 'Asia/Kolkata' }))
      .status,
  ).toBe(201);
  const branchAdmin = createAccount(uniqueEmail('ba'), 'Pune Admin (Demo)');
  grantRole(branchAdmin, 'branch_admin', slug, 'PUN');

  // Categories and tags (D-128).
  await page.goto('/admin/settings/catalog');
  await expect(page.getByRole('heading', { name: 'No categories yet' })).toBeVisible();
  await page.getByLabel(/^Category name/).fill('Safety');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByText('Category added.')).toBeVisible();
  await page.getByLabel(/^Tag name/).fill('PPE');
  await page.getByRole('button', { name: 'Add tag' }).click();
  await expect(page.getByText('Tag added.')).toBeVisible();
  // Each row's actions name the tag (WCAG 2.4.6).
  await expect(
    page.getByRole('list', { name: 'Tags' }).getByRole('button', { name: 'Rename PPE' }),
  ).toBeVisible();
  await expectNoAxeViolations(page);

  // A new course starts as a draft.
  await page.goto('/admin/courses');
  await expect(page.getByRole('heading', { name: 'No courses yet' })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole('link', { name: 'New course' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'New course' })).toBeVisible();
  await expect(page.getByLabel(/^Course title/)).toBeFocused();
  await page.getByLabel(/^Course title/).fill('Lockout tagout (Demo)');
  await page.getByLabel(/^Category/).click();
  await page.getByRole('option', { name: 'Safety' }).click();
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page).toHaveURL(/\/admin\/courses\/[0-9a-f-]{36}$/);
  const courseUrl = page.url();
  const courseId = courseUrl.split('/').at(-1)!;
  await expect(
    page.getByRole('heading', { level: 1, name: 'Lockout tagout (Demo)' }),
  ).toBeVisible();
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();

  // Builder step 1: the basics are saved for real.
  await page.getByLabel(/^Summary/).fill('Isolate energy before maintenance.');
  await page.getByLabel(/^Level/).click();
  await page.getByRole('option', { name: 'Beginner' }).click();
  await page.getByRole('checkbox', { name: 'PPE' }).check();
  await page.getByLabel(/^Estimated duration/).fill('45');
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/^Summary/)).toHaveValue('Isolate energy before maintenance.');
  await expect(page.getByRole('checkbox', { name: 'PPE' })).toBeChecked();

  // Someone else saves meanwhile (version 2 → 3): this page still holds version 2.
  const other = await apiPost(
    page,
    `/courses/${courseId}/draft`,
    { version: 2, title: 'Lockout and tagout (Demo)' },
    'PATCH',
  );
  expect(other.status).toBe(200);
  await page.getByLabel(/^Audience/).fill('Maintenance staff');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Someone else saved this draft meanwhile')).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Reload the draft' }).click();
  await expect(page.getByLabel(/^Course title/)).toHaveValue('Lockout and tagout (Demo)');
  await expect(page.getByLabel(/^Audience/)).toHaveValue('');

  // The list shows the draft with its category.
  await page.goto('/admin/courses');
  const row = page.getByRole('row', { name: /Lockout and tagout/ });
  await expect(row.getByText('Safety')).toBeVisible();
  await expect(row.getByText('Draft')).toBeVisible();

  // A Branch Admin reads every course, drafts included, read-only (D-127).
  await page.context().clearCookies();
  await activate(page, branchAdmin);
  await signIn(page, branchAdmin);
  await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });
  await page.goto('/admin/courses');
  await expect(page.getByRole('link', { name: 'Lockout and tagout (Demo)' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'New course' })).toHaveCount(0);
  await page.goto(courseUrl);
  await expect(page.getByText('Only a Tenant Admin can edit this draft.')).toBeVisible();
  await expect(page.getByLabel(/^Course title/)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);
  await expectNoAxeViolations(page);
});

// A 1×1 PNG, and a Windows executable renamed to .png: the API decides by the contents (D-132).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0x90)]);

/** True once the browser has fetched and decoded the image (through the API's redirect to a signed link). */
const loaded = (img: import('@playwright/test').Locator) =>
  img.evaluate(
    (el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0,
  );

test('a Tenant Admin uploads a course cover; a wrong file type is refused; a Branch Admin sees the cover', async ({
  page,
}) => {
  test.slow();
  const { slug, admin } = await tenantWithAdmin(page, 'covers');
  await activate(page, admin);
  await signIn(page, admin);
  await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });
  expect(
    (await apiPost(page, '/branches', { code: 'NSK', name: 'Nashik', timezone: 'Asia/Kolkata' }))
      .status,
  ).toBe(201);
  const branchAdmin = createAccount(uniqueEmail('ba'), 'Nashik Admin (Demo)');
  grantRole(branchAdmin, 'branch_admin', slug, 'NSK');
  const created = await apiPost(page, '/courses', { title: 'Confined spaces (Demo)' });
  expect(created.status).toBe(201);
  const courseUrl = `/admin/courses/${(created.body as { id: string }).id}`;

  await page.goto(courseUrl);
  await expect(page.getByText('No cover image.')).toBeVisible();
  const picker = page.getByLabel('Upload a cover image');
  await picker.setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: EXE });
  await expect(picker).toHaveAccessibleDescription(/This file is not a PNG, JPEG or WebP image\./);
  await expectNoAxeViolations(page);

  await picker.setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText(/New cover: cover\.png \(not saved yet\)/)).toBeVisible();
  const preview = page.getByRole('img', { name: 'Cover image for Confined spaces (Demo)' });
  await expect.poll(() => loaded(preview)).toBe(true);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Current cover: cover.png')).toBeVisible();
  await expectNoAxeViolations(page);

  // The list shows the thumbnail (decorative: the title names the course).
  await page.goto('/admin/courses');
  const thumb = page.getByRole('row', { name: /Confined spaces/ }).locator('img');
  await expect.poll(() => loaded(thumb)).toBe(true);

  // A Branch Admin reads the course and sees its cover, without editing it (D-127, D-133).
  await page.context().clearCookies();
  await activate(page, branchAdmin);
  await signIn(page, branchAdmin);
  await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });
  await page.goto(courseUrl);
  const readOnly = page.getByRole('img', { name: 'Cover image for Confined spaces (Demo)' });
  await expect.poll(() => loaded(readOnly)).toBe(true);
  await expect(page.getByLabel('Upload a cover image')).toHaveCount(0);
  await expectNoAxeViolations(page);
});
