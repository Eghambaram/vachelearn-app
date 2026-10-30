import type { SessionContextView } from '@vachelearn/contracts';
import { NAV } from '@/lib/nav';
import { availableRoles, chooseRole, phaseFor, toSessionView } from './session-view';

const BASE: SessionContextView = {
  user: {
    id: '01900000-0000-7000-8000-000000000001',
    email: 'asha@example.test',
    displayName: 'Asha (Demo)',
  },
  activeTenant: {
    membershipId: '01900000-0000-7000-8000-0000000000a1',
    tenantId: '01900000-0000-7000-8000-0000000000aa',
    slug: 'tenant-a',
    displayName: 'Tenant A (Demo)',
  },
  support: null,
  memberships: [
    {
      membershipId: '01900000-0000-7000-8000-0000000000a1',
      tenantId: '01900000-0000-7000-8000-0000000000aa',
      displayName: 'Tenant A (Demo)',
      status: 'active',
      active: true,
    },
  ],
  roles: [],
  platformRoles: [],
  tenantPermissions: [],
  platformPermissions: [],
};
const LABELS = { wholeTenant: 'Whole organisation', platform: 'Platform' };
const A1 = { id: '01900000-0000-7000-8000-0000000000b1', code: 'A1', name: 'Branch A1' };

describe('session view (D-096)', () => {
  it('lands in the most capable real role; a preferred role counts only if really held', () => {
    const ctx = {
      ...BASE,
      roles: [
        { role: 'learner' as const, branch: null },
        { role: 'branch_admin' as const, branch: A1 },
      ],
    };
    expect(availableRoles(ctx)).toEqual(['branch_admin', 'learner']);
    expect(chooseRole(ctx, undefined)).toBe('branch_admin');
    expect(chooseRole(ctx, 'learner')).toBe('learner');
    expect(chooseRole(ctx, 'tenant_admin')).toBe('branch_admin');
    expect(chooseRole(ctx, 'nonsense')).toBe('branch_admin');
    expect(chooseRole(BASE, undefined)).toBeNull();
  });

  it('labels the scope from the chosen role’s branches; permissions come from the API, never derived', () => {
    const ctx = {
      ...BASE,
      roles: [{ role: 'branch_admin' as const, branch: A1 }],
      tenantPermissions: ['branch.read', 'role.assign'],
    };
    const view = toSessionView(ctx, 'branch_admin', LABELS);
    expect(view).toMatchObject({
      role: 'branch_admin',
      scopeLabel: 'Branch A1',
      branchScope: [{ id: A1.id, name: 'Branch A1' }],
      permissions: ['branch.read', 'role.assign'],
      demo: false,
      activeTenantId: BASE.activeTenant!.tenantId,
    });
    expect(view.memberships[0]).toMatchObject({ membershipId: BASE.memberships[0]!.membershipId });
  });

  it('platform staff: platform role first; a support session is carried to the banner', () => {
    const ctx: SessionContextView = {
      ...BASE,
      activeTenant: null,
      memberships: [],
      platformRoles: ['platform_super_admin'],
      platformPermissions: ['tenant.read'],
      support: {
        sessionId: '01900000-0000-7000-8000-0000000000c1',
        tenant: {
          id: BASE.activeTenant!.tenantId,
          slug: 'tenant-a',
          displayName: 'Tenant A (Demo)',
        },
        expiresAt: '2026-10-29T10:00:00.000Z',
      },
    };
    expect(chooseRole(ctx, undefined)).toBe('platform_super_admin');
    const view = toSessionView(ctx, 'platform_super_admin', LABELS);
    expect(view.scopeLabel).toBe('Platform');
    expect(view.support).toEqual({
      sessionId: '01900000-0000-7000-8000-0000000000c1',
      tenantName: 'Tenant A (Demo)',
      expiresAt: '2026-10-29T10:00:00.000Z',
    });
  });
});

describe('not-yet-real screens (D-097)', () => {
  it('name the phase that brings them', () => {
    expect(phaseFor('/admin/courses/123/build')).toBe(3);
    expect(phaseFor('/learn')).toBe(4);
    expect(phaseFor('/admin/reports/compliance')).toBe(5);
    expect(phaseFor('/platform')).toBe(6);
  });

  it('never promise a phase already finished: every nav screen names Phase 2 or later', () => {
    for (const item of Object.values(NAV).flat()) {
      expect(Number.isInteger(phaseFor(item.href)), item.href).toBe(true);
      expect(phaseFor(item.href), item.href).toBeGreaterThanOrEqual(2);
      expect(phaseFor(`${item.href}/nested`)).toBe(phaseFor(item.href));
    }
  });
});
