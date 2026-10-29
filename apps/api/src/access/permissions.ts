import { GRANTS, MATRIX_ROLES, type MatrixRole, type PermissionKey } from './role-grants';

/*
 * Permission registry (CLAUDE.md: `resource.action`) and the fixed roles (D-053). The grants table is role-grants.ts,
 * which mirrors docs/ROLE_PERMISSION_MATRIX.md cell for cell (a test compares them). A permission is a platform
 * permission when the Platform Super Admin cell is a P scope; it is a tenant permission when any tenant role holds it.
 * Platform roles never imply tenant access (D-037): `SS` cells apply only inside a support session (2.4c).
 */

export type { PermissionKey };

type Grants = typeof GRANTS;
type TenantColumn = Exclude<MatrixRole, 'PSA'>;

/** Keys the Platform Super Admin holds on platform routes. */
export type PlatformPermission = {
  [K in PermissionKey]: Grants[K]['PSA'] extends `P${string}` ? K : never;
}[PermissionKey];

/** Keys at least one tenant role holds. */
export type TenantPermission = {
  [K in PermissionKey]: Exclude<Grants[K][TenantColumn], '—'> extends never ? never : K;
}[PermissionKey];

const KEYS = Object.keys(GRANTS) as PermissionKey[];

export const PLATFORM_PERMISSIONS = KEYS.filter((k) =>
  GRANTS[k].PSA.startsWith('P'),
) as PlatformPermission[];

export const TENANT_PERMISSIONS = KEYS.filter((k) =>
  MATRIX_ROLES.some((r) => r !== 'PSA' && GRANTS[k][r] !== '—'),
) as TenantPermission[];

/**
 * What platform staff may do inside a support session (D-037): exactly the Platform Super Admin's `SS` cells — all reads.
 * Every one reaches the whole tenant; none is a write (a test checks).
 */
export const SUPPORT_PERMISSIONS = KEYS.filter((k) => GRANTS[k].PSA === 'SS') as TenantPermission[];

/** The fixed tenant roles (D-053) and their matrix columns. */
export const TENANT_ROLES = {
  tenant_admin: 'TA',
  branch_admin: 'BA',
  learning_manager: 'LM',
  instructor: 'INS',
  learner: 'LRN',
  compliance_viewer: 'CV',
} as const satisfies Record<string, TenantColumn>;
export type TenantRole = keyof typeof TENANT_ROLES;

export const PLATFORM_ROLES = { platform_super_admin: 'PSA' } as const;
export type PlatformRole = keyof typeof PLATFORM_ROLES;

/** Roles that only make sense on branches: a Branch Admin is always branch-scoped (matrix scope code B). */
export const BRANCH_ONLY_ROLES: readonly TenantRole[] = ['branch_admin'];
/** Roles that only make sense for the whole tenant: a Tenant Admin's grants (settings, roles…) have no branch. */
export const TENANT_ONLY_ROLES: readonly TenantRole[] = ['tenant_admin'];

/**
 * How far one grant reaches: every branch of the tenant, the listed branches, resources assigned to the user
 * (Instructor, `A`) or the user's own records (`O`). `A` and `O` are applied by the services that own those
 * resources (Phase 3+); the branch modules use the branch scope.
 */
export type GrantScope =
  | { kind: 'all' }
  | { kind: 'branches'; branchIds: ReadonlySet<string> }
  | { kind: 'assigned' }
  | { kind: 'own' };

/** The scope code at the start of a matrix cell (`B (read)` → B, `own tenant` → T, `entitled lessons (O)` → O). */
export function scopeCode(cell: string): 'P' | 'T' | 'S' | 'B' | 'A' | 'O' | 'SS' | null {
  if (cell === '—') return null;
  if (cell.startsWith('own tenant')) return 'T';
  if (/\(O\)$/.test(cell)) return 'O';
  const match = /^(SS|P|T|S|B|A|O)\b/.exec(cell);
  return (match?.[1] as 'P' | 'T' | 'S' | 'B' | 'A' | 'O' | 'SS' | undefined) ?? null;
}

export type TenantAssignment = { role: TenantRole; branchId: string | null };

/**
 * What a member's live role assignments grant in the active tenant: each permission with its widest scope (all
 * branches > some branches > assigned > own). A tenant-wide assignment of an `S`-scoped role reaches every branch; a
 * branch assignment reaches that branch only.
 *
 * Known limit (isolation audit 2.4a, for Phase 4): the merge keeps one kind per permission, so a member holding both
 * "own records" and "some branches" for the same key is narrowed to the branches. That fails closed today; before
 * services use `own`/`assigned` reach (4.1), keep a union per key and give services all of it.
 */
export function tenantGrants(assignments: readonly TenantAssignment[]) {
  const grants = new Map<PermissionKey, GrantScope>();
  for (const { role, branchId } of assignments) {
    const column = TENANT_ROLES[role];
    for (const key of KEYS) {
      const code = scopeCode(GRANTS[key][column]);
      if (!code || code === 'P' || code === 'SS') continue;
      // A whole-tenant (T) grant never comes from a branch assignment: fail closed (the database also refuses a
      // Tenant Admin on a branch).
      if (code === 'T' && branchId !== null) continue;
      const scope: GrantScope =
        code === 'A'
          ? { kind: 'assigned' }
          : code === 'O'
            ? { kind: 'own' }
            : branchId === null && code !== 'B'
              ? { kind: 'all' }
              : branchId === null
                ? { kind: 'branches', branchIds: new Set() }
                : { kind: 'branches', branchIds: new Set([branchId]) };
      grants.set(key, widest(grants.get(key), scope));
    }
  }
  return grants;
}

const RANK = { all: 3, branches: 2, assigned: 1, own: 0 } as const;

function widest(a: GrantScope | undefined, b: GrantScope): GrantScope {
  if (!a) return b;
  if (a.kind === 'branches' && b.kind === 'branches') {
    return { kind: 'branches', branchIds: new Set([...a.branchIds, ...b.branchIds]) };
  }
  return RANK[a.kind] >= RANK[b.kind] ? a : b;
}

/** Platform permissions of the live platform roles (P cells only; SS cells need a support session). */
export function platformGrants(roles: readonly PlatformRole[]) {
  return new Set<PlatformPermission>(roles.length > 0 ? PLATFORM_PERMISSIONS : []);
}
