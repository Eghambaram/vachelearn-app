import type { SessionContextView } from '@vachelearn/contracts';

/*
 * Which real sessions see sample data while ENABLE_DEMO_CONTENT is on (D-110, exit-gate security review): only the
 * seeded demo tenants, and platform screens with no tenant — never another organisation or a support session.
 */

let context: SessionContextView;
let flag = true;
vi.mock('@/lib/auth/session', () => ({
  getSessionContext: async () => ({ status: 'signed-in', context }),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock('@/lib/dev-tools', () => ({
  isDemoContentEnabled: () => flag,
  isDemoWorkspacesEnabled: () => false,
}));

const { getSession } = await import('./session');

const tenant = (slug: string) => ({
  membershipId: '01900000-0000-7000-8000-0000000000a1',
  tenantId: '01900000-0000-7000-8000-0000000000aa',
  slug,
  displayName: `${slug} (Demo)`,
});

function learnerIn(slug: string): SessionContextView {
  const active = tenant(slug);
  return {
    user: { id: '01900000-0000-7000-8000-000000000001', email: 'a@example.test', displayName: 'A' },
    activeTenant: active,
    support: null,
    memberships: [
      {
        membershipId: active.membershipId,
        tenantId: active.tenantId,
        displayName: active.displayName,
        status: 'active',
        active: true,
      },
    ],
    roles: [{ role: 'learner', branch: null }],
    platformRoles: [],
    tenantPermissions: ['catalog.browse'],
    platformPermissions: [],
  };
}

const staff = (support: SessionContextView['support']): SessionContextView => ({
  ...learnerIn('unused'),
  activeTenant: null,
  memberships: [],
  roles: [],
  platformRoles: ['platform_super_admin'],
  tenantPermissions: [],
  platformPermissions: ['tenant.read'],
  support,
});

describe('demo content for real sessions (D-110)', () => {
  beforeEach(() => {
    flag = true;
  });

  it('is on in the seeded demo tenants only', async () => {
    for (const slug of ['demo-manufacturing', 'demo-logistics']) {
      context = learnerIn(slug);
      expect((await getSession()).demoContent).toBe(true);
    }
  });

  it('a real organisation keeps "Not available yet", even with the flag on', async () => {
    for (const slug of ['acme-logistics', 'tenant-a', 'demo-manufacturing-2']) {
      context = learnerIn(slug);
      expect((await getSession()).demoContent).toBe(false);
    }
  });

  it('platform screens without a tenant may show samples; a support session never does', async () => {
    context = staff(null);
    expect((await getSession()).demoContent).toBe(true);
    context = staff({
      sessionId: '01900000-0000-7000-8000-0000000000c1',
      tenant: { id: '01900000-0000-7000-8000-0000000000aa', slug: 'acme', displayName: 'Acme' },
      expiresAt: '2026-11-11T12:00:00.000Z',
    });
    expect((await getSession()).demoContent).toBe(false);
  });

  it('is off everywhere when the flag is off', async () => {
    flag = false;
    context = learnerIn('demo-manufacturing');
    expect((await getSession()).demoContent).toBe(false);
  });
});
