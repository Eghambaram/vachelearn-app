/*
 * Permission registry (CLAUDE.md: `resource.action`). Mirrors docs/ROLE_PERMISSION_MATRIX.md — a test fails when a key
 * here is missing from the matrix. Keys are added with the slice that first enforces them; Slice 2.4 completes the
 * registry with the role → permission sets (D-053).
 */

export const PLATFORM_PERMISSIONS = [
  'tenant.create',
  'tenant.read',
  'tenant.update',
  'tenant.suspend',
  'tenant.archive',
] as const;

export const TENANT_PERMISSIONS = [
  'branch.read',
  'branch.create',
  'branch.update',
  'branch.deactivate',
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];
export type TenantPermission = (typeof TENANT_PERMISSIONS)[number];
