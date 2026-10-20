import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEMO_ROLE_PERMISSIONS } from '@/mocks/demo-session';
import { ROLE_KEYS, ROLE_WORKSPACE, WORKSPACE_HOME, type RoleKey } from './api/session-types';
import { activeNavId, findNavItem, NAV, navFor } from './nav';

function visibleIds(role: RoleKey) {
  return navFor(ROLE_WORKSPACE[role], DEMO_ROLE_PERMISSIONS[role]).map((item) => item.id);
}

describe('navigation per role (demo permissions from the matrix)', () => {
  it('platform super admin sees the platform workspace only', () => {
    expect(visibleIds('platform_super_admin')).toEqual([
      'dashboard',
      'tenants',
      'platform-users',
      'audit',
      'settings',
    ]);
  });

  it('tenant admin sees every admin item', () => {
    expect(visibleIds('tenant_admin')).toEqual(NAV.admin.map((item) => item.id));
  });

  it('branch admin cannot see the assessment builder', () => {
    expect(visibleIds('branch_admin')).not.toContain('assessments');
    expect(visibleIds('branch_admin')).toContain('roles');
  });

  it('learning manager cannot assign roles, invite or read the audit log', () => {
    const ids = visibleIds('learning_manager');
    expect(ids).not.toEqual(expect.arrayContaining(['roles']));
    expect(ids).not.toContain('invitations');
    expect(ids).not.toContain('audit');
    expect(ids).toContain('assignments');
  });

  it('compliance viewer gets read-only navigation (no assigning, roles or invitations)', () => {
    const ids = visibleIds('compliance_viewer');
    for (const id of ['assignments', 'roles', 'invitations', 'assessments']) {
      expect(ids).not.toContain(id);
    }
    expect(ids).toEqual(expect.arrayContaining(['compliance', 'reports', 'audit']));
  });

  it('instructor and learner see their own workspaces', () => {
    expect(visibleIds('instructor')).toEqual(['dashboard', 'sessions', 'courses', 'results']);
    expect(visibleIds('learner')).toEqual(['dashboard', 'my-learning', 'catalog', 'certificates']);
  });

  it('every role sees its workspace dashboard', () => {
    for (const role of ROLE_KEYS) {
      const workspace = ROLE_WORKSPACE[role];
      const items = navFor(workspace, DEMO_ROLE_PERMISSIONS[role]);
      expect(items[0]?.href, role).toBe(WORKSPACE_HOME[workspace]);
    }
  });

  it('shows nothing without permissions (deny by default)', () => {
    expect(navFor('admin', [])).toEqual([]);
  });
});

describe('nav lookups', () => {
  it('marks the deepest matching item current, not its parent', () => {
    const items = NAV.admin;
    expect(activeNavId(items, '/admin')).toBe('dashboard');
    expect(activeNavId(items, '/admin/courses')).toBe('courses');
    expect(activeNavId(items, '/admin/courses/123/build/content')).toBe('courses');
    expect(activeNavId(items, '/admin/coursesx')).toBe('dashboard');
  });

  it('finds placeholder items by exact path only', () => {
    expect(findNavItem('admin', '/admin/courses')?.id).toBe('courses');
    expect(findNavItem('admin', '/admin/courses/123')).toBeUndefined();
    expect(findNavItem('learn', '/admin/courses')).toBeUndefined();
  });

  it('has unique ids and hrefs inside each workspace', () => {
    for (const items of Object.values(NAV)) {
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
      expect(new Set(items.map((i) => i.href)).size).toBe(items.length);
    }
  });
});

describe('permission keys', () => {
  const matrix = readFileSync(
    path.join(process.cwd(), '..', '..', 'docs', 'ROLE_PERMISSION_MATRIX.md'),
    'utf8',
  );

  it('uses only keys defined in docs/ROLE_PERMISSION_MATRIX.md', () => {
    const keys = new Set([
      ...Object.values(NAV).flatMap((items) => items.map((item) => item.permission)),
      ...Object.values(DEMO_ROLE_PERMISSIONS).flat(),
    ]);
    const missing = [...keys].filter((key) => !matrix.includes(`\`${key}\``));
    expect(missing).toEqual([]);
  });
});
