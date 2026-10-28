import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PLATFORM_PERMISSIONS,
  scopeCode,
  TENANT_PERMISSIONS,
  tenantGrants,
} from '../src/access/permissions';
import { GRANTS, MATRIX_ROLES } from '../src/access/role-grants';

/*
 * The permission registry is docs/ROLE_PERMISSION_MATRIX.md (spec 2.4 AC: "a test compares them"): every key and every
 * role cell in the "Permission keys × roles" table must equal src/access/role-grants.ts, so neither can change alone.
 */

function matrixGrants() {
  const doc = readFileSync(resolve(__dirname, '../../../docs/ROLE_PERMISSION_MATRIX.md'), 'utf8');
  const table = doc.slice(
    doc.indexOf('## Permission keys × roles'),
    doc.indexOf('## Granting rules'),
  );
  const grants: Record<string, Record<string, string>> = {};
  for (const line of table.split('\n').filter((l) => l.startsWith('| `'))) {
    const cells = line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
    const keys = [...cells[0]!.matchAll(/`([a-z_.]+)`/g)].map((m) => m[1]!);
    for (const key of keys) {
      grants[key] = Object.fromEntries(MATRIX_ROLES.map((role, i) => [role, cells[2 + i]!]));
    }
  }
  return grants;
}

describe('permission registry ⇔ docs/ROLE_PERMISSION_MATRIX.md', () => {
  it('has exactly the same keys and the same cell for every role', () => {
    expect(GRANTS).toEqual(matrixGrants());
  });

  it('every cell has a known scope code (or is denied)', () => {
    for (const [key, cells] of Object.entries(GRANTS)) {
      for (const [role, cell] of Object.entries(cells)) {
        expect(cell === '—' || scopeCode(cell) !== null, `${key} / ${role}: "${cell}"`).toBe(true);
      }
    }
  });

  it('platform permissions are the P cells of the Platform Super Admin; SS cells are not among them (D-037)', () => {
    expect(PLATFORM_PERMISSIONS).toContain('tenant.create');
    expect(PLATFORM_PERMISSIONS).not.toContain('branch.read'); // SS: support sessions only
    expect(PLATFORM_PERMISSIONS.every((k) => GRANTS[k].PSA.startsWith('P'))).toBe(true);
  });

  it('Compliance Viewer is read-only: no manage, create, update, cancel, revoke or delete keys', () => {
    const writes = TENANT_PERMISSIONS.filter(
      (k) =>
        GRANTS[k].CV !== '—' &&
        /\.(manage|create|update|cancel|revoke|delete|assign|record|export_manage)/.test(k),
    );
    expect(writes).toEqual([]);
  });
});

describe('tenantGrants (scope of each permission)', () => {
  it('a tenant-wide Tenant Admin reaches every branch', () => {
    expect(tenantGrants([{ role: 'tenant_admin', branchId: null }]).get('branch.read')).toEqual({
      kind: 'all',
    });
  });

  it('a Branch Admin reaches only their branches; several assignments add up', () => {
    const grants = tenantGrants([
      { role: 'branch_admin', branchId: 'a1' },
      { role: 'branch_admin', branchId: 'a2' },
    ]);
    const scope = grants.get('branch.read');
    expect(scope?.kind).toBe('branches');
    expect(scope?.kind === 'branches' && [...scope.branchIds].sort()).toEqual(['a1', 'a2']);
    expect(grants.has('branch.create')).toBe(false);
  });

  it('the widest grant wins, and a learner holds only own-record permissions', () => {
    const grants = tenantGrants([
      { role: 'learner', branchId: null },
      { role: 'branch_admin', branchId: 'a1' },
    ]);
    expect(grants.get('enrollment.read')).toEqual({
      kind: 'branches',
      branchIds: new Set(['a1']),
    });
    expect(tenantGrants([{ role: 'learner', branchId: null }]).get('enrollment.read')).toEqual({
      kind: 'own',
    });
    expect(tenantGrants([{ role: 'learner', branchId: null }]).has('branch.read')).toBe(false);
  });

  it('a Learning Manager on a branch reaches that branch; tenant-wide reaches all', () => {
    expect(tenantGrants([{ role: 'learning_manager', branchId: 'a1' }]).get('report.read')).toEqual(
      {
        kind: 'branches',
        branchIds: new Set(['a1']),
      },
    );
    expect(tenantGrants([{ role: 'learning_manager', branchId: null }]).get('report.read')).toEqual(
      {
        kind: 'all',
      },
    );
  });
});
