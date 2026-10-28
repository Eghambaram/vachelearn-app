import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
}

/** Selects a demo role the way the switcher's server action does (D-063 demo cookie). */
async function useRole(context: BrowserContext, baseURL: string | undefined, role: string) {
  await context.addCookies([{ name: 'vl_demo_role', value: role, url: baseURL! }]);
}

function mainNav(page: Page) {
  return page.getByRole('navigation', { name: 'Main' });
}

const EXPECTED_NAV: Record<string, { home: string; links: string[] }> = {
  platform_super_admin: {
    home: '/platform',
    links: ['Dashboard', 'Tenants', 'Platform users', 'Audit log', 'System settings'],
  },
  tenant_admin: {
    home: '/admin',
    links: [
      'Dashboard',
      'Branches',
      'People',
      'Groups',
      'Roles',
      'Invitations',
      'Courses',
      'Assignments',
      'Team progress',
      'Assessments',
      'Certificates',
      'Compliance',
      'Reports',
      'Analytics',
      'Exports',
      'Audit log',
      'Settings',
    ],
  },
  compliance_viewer: {
    home: '/admin',
    links: [
      'Dashboard',
      'Branches',
      'People',
      'Groups',
      'Courses',
      'Team progress',
      'Certificates',
      'Compliance',
      'Reports',
      'Analytics',
      'Exports',
      'Audit log',
      'Settings',
    ],
  },
  instructor: { home: '/instructor', links: ['Dashboard', 'Sessions', 'Courses', 'Results'] },
  learner: {
    home: '/learn',
    links: ['Dashboard', 'My learning', 'Course catalog', 'My certificates'],
  },
};

test.describe('workspace shell at 1440 px (Slice 1.4)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const [role, { home, links }] of Object.entries(EXPECTED_NAV)) {
    test(`${role} sees exactly its navigation`, async ({ page, context, baseURL }) => {
      await useRole(context, baseURL, role);
      await page.goto(home);
      await expect(mainNav(page).getByRole('link')).toHaveText(links);
      await expect(mainNav(page).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });
  }

  test('skip link is the first stop and moves focus to main', async ({ page }) => {
    await page.goto('/admin');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main')).toBeFocused();
  });

  test('keyboard only: tab to a nav item, open it, and the page and nav agree', async ({
    page,
  }) => {
    await page.goto('/admin');
    // Groups is still a placeholder screen (slice 3.2), so this checks the D-061 page too.
    const groups = mainNav(page).getByRole('link', { name: 'Groups' });
    for (
      let i = 0;
      i < 30 && !(await groups.evaluate((el) => el === document.activeElement));
      i++
    ) {
      await page.keyboard.press('Tab');
    }
    await expect(groups).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/admin\/groups$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Groups' })).toBeVisible();
    await expect(groups).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Planned for slice 3.2')).toBeVisible();
    await expect(page).toHaveTitle('Groups · VacheLearn');
  });

  test('demo role switcher changes workspace without JavaScript tricks (plain form)', async ({
    page,
  }) => {
    await page.goto('/admin');
    await page.getByLabel('View as').selectOption('learner');
    await page.getByRole('button', { name: 'Switch role' }).click();
    await expect(page).toHaveURL(/\/learn$/);
    await expect(mainNav(page).getByRole('link')).toHaveText(EXPECTED_NAV.learner!.links);
  });

  test('workspace switcher changes tenant from the keyboard', async ({ page }) => {
    await page.goto('/admin/courses');
    const switcher = page.getByRole('button', {
      name: /^Example Manufacturing \(Demo\).*switch workspace/,
    });
    await switcher.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitemradio', { name: 'Example Logistics (Demo)' }).click();
    // Server action + redirect + server render of the /admin dashboard: 5-6 s under parallel load on WSL.
    await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 });
    await expect(
      page.getByRole('button', { name: /^Example Logistics \(Demo\).*switch workspace/ }),
    ).toBeVisible();
  });

  test('user menu offers profile and states that sign-out is not connected yet', async ({
    page,
  }) => {
    await page.goto('/admin');
    const trigger = page.getByRole('button', { name: /Demo User.*\(account menu\)/ });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Your profile' })).toBeVisible();
    await expect(
      menu.getByRole('menuitem', { name: /Sign-out arrives with authentication/ }),
    ).toHaveAttribute('aria-disabled', 'true');
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });

  test('a role outside a workspace gets permission-denied inside its own shell', async ({
    page,
    context,
    baseURL,
  }) => {
    await useRole(context, baseURL, 'learner');
    await page.goto('/admin/users');
    await expect(
      page.getByRole('heading', { level: 1, name: 'You do not have access to this' }),
    ).toBeVisible();
    await expect(mainNav(page).getByRole('link')).toHaveText(EXPECTED_NAV.learner!.links);
  });

  test('a nav page the role may not see is denied; an unknown path is 404', async ({
    page,
    context,
    baseURL,
  }) => {
    await useRole(context, baseURL, 'learning_manager');
    await page.goto('/admin/roles');
    await expect(
      page.getByRole('heading', { level: 1, name: 'You do not have access to this' }),
    ).toBeVisible();
    const response = await page.goto('/admin/does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  });

  for (const path of ['/admin', '/platform', '/learn', '/account']) {
    test(`${path} has no detectable accessibility violations`, async ({
      page,
      context,
      baseURL,
    }) => {
      const role = {
        '/admin': 'tenant_admin',
        '/platform': 'platform_super_admin',
        '/learn': 'learner',
        '/account': 'instructor',
      }[path]!;
      await useRole(context, baseURL, role);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoAxeViolations(page);
    });
  }
});

test.describe('workspace shell at 360 px (Slice 1.4)', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test('sidebar collapses into a drawer that traps focus, closes on Escape and returns focus', async ({
    page,
  }) => {
    await page.goto('/admin');
    await expect(mainNav(page)).toBeHidden();
    const trigger = page.getByRole('button', { name: 'Open navigation menu' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const drawer = page.getByRole('dialog', { name: 'Navigation' });
    await expect(drawer).toBeVisible();
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab');
      expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('following a drawer link navigates and closes the drawer', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Navigation' });
    await drawer.getByRole('link', { name: 'Reports' }).click();
    await expect(page).toHaveURL(/\/admin\/reports$/);
    await expect(drawer).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
  });

  for (const path of ['/admin', '/learn', '/', '/login', '/select-workspace', '/help']) {
    test(`${path} fits 360 px without sideways scrolling`, async ({ page, context, baseURL }) => {
      if (path === '/learn') await useRole(context, baseURL, 'learner');
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('public, auth and system pages (Slice 1.4)', () => {
  for (const path of ['/', '/login', '/select-workspace', '/help', '/forbidden', '/suspended']) {
    test(`${path} has a skip link, one h1 and no detectable accessibility violations`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
      await expectNoAxeViolations(page);
    });
  }

  test('home page offers sign-in, which opens the sign-in form', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel(/^Email address/)).toBeVisible();
    await expect(page.getByLabel(/^Password/)).toBeVisible();
  });

  test('workspace picker lists demo memberships and opens a role’s workspace', async ({ page }) => {
    await page.goto('/select-workspace');
    await expect(page.getByRole('button', { name: /Example Logistics \(Demo\)/ })).toBeVisible();
    await page.getByRole('button', { name: 'Instructor' }).click();
    await expect(page).toHaveURL(/\/instructor$/);
  });

  test('unknown pages are 404 with the shared wording', async ({ page }) => {
    const response = await page.goto('/no-such-page');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
