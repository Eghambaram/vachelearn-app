import type { RoleKey, SessionView, TenantMembership } from '@/lib/api/session-types';

/*
 * Phase 1 demo fixtures only (web rules: mocks/ is unused once the real endpoint exists). Names are fictional and
 * labelled as examples. Nothing here is used for authorization: Phase 2 replaces it with the API's session.
 */

export const DEMO_TENANTS: readonly TenantMembership[] = [
  { tenantId: 'demo-tenant-1', tenantName: 'Example Manufacturing (Demo)' },
  { tenantId: 'demo-tenant-2', tenantName: 'Example Logistics (Demo)' },
];

export const DEFAULT_DEMO_ROLE: RoleKey = 'tenant_admin';

/**
 * Permission keys per role, copied from docs/ROLE_PERMISSION_MATRIX.md for the keys navigation uses. The matrix is
 * the source of truth; Phase 2.4 implements it in the API and this table is deleted.
 */
export const DEMO_ROLE_PERMISSIONS: Record<RoleKey, readonly string[]> = {
  platform_super_admin: [
    'analytics.read',
    'tenant.read',
    'platform_user.manage',
    'platform.audit.read',
    'platform.settings.read',
  ],
  tenant_admin: [
    'report.read',
    'branch.read',
    'user.read',
    'group.read',
    'role.assign',
    'invitation.read',
    'course.read',
    'assignment.create',
    'enrollment.read',
    'assessment.manage',
    'certificate.read',
    'compliance.read',
    'report.export',
    'analytics.read',
    'audit.read',
    'tenant_settings.read',
  ],
  branch_admin: [
    'report.read',
    'branch.read',
    'user.read',
    'group.read',
    'role.assign',
    'invitation.read',
    'course.read',
    'assignment.create',
    'enrollment.read',
    'certificate.read',
    'compliance.read',
    'report.export',
    'analytics.read',
    'audit.read',
    'tenant_settings.read',
  ],
  learning_manager: [
    'report.read',
    'branch.read',
    'user.read',
    'group.read',
    'course.read',
    'assignment.create',
    'enrollment.read',
    'certificate.read',
    'compliance.read',
    'report.export',
    'analytics.read',
    'tenant_settings.read',
  ],
  compliance_viewer: [
    'report.read',
    'branch.read',
    'user.read',
    'group.read',
    'course.read',
    'enrollment.read',
    'certificate.read',
    'compliance.read',
    'report.export',
    'analytics.read',
    'audit.read',
    'tenant_settings.read',
  ],
  instructor: [
    'user.read',
    'course.read',
    'catalog.browse',
    'enrollment.read',
    'attempt.review',
    'certificate.read',
    'report.read',
    'class_session.manage',
    'attendance.record',
  ],
  learner: [
    'catalog.browse',
    'enrollment.read',
    'attempt.take',
    'attempt.review',
    'certificate.read',
    'compliance.read',
  ],
};

const SCOPE_LABEL: Record<RoleKey, string> = {
  platform_super_admin: 'Platform',
  tenant_admin: 'Whole organisation',
  branch_admin: 'Example Branch A1',
  learning_manager: 'Whole organisation',
  compliance_viewer: 'Whole organisation',
  instructor: 'Assigned sessions',
  learner: 'Own learning',
};

export function buildDemoSession(role: RoleKey, tenantId: string | null): SessionView {
  const platform = role === 'platform_super_admin';
  const memberships = platform ? [] : DEMO_TENANTS;
  const activeTenantId = platform
    ? null
    : (memberships.find((m) => m.tenantId === tenantId) ?? memberships[0]!).tenantId;
  return {
    user: { id: 'demo-user', displayName: 'Demo User', email: 'demo.user@example.invalid' },
    role,
    scopeLabel: SCOPE_LABEL[role],
    memberships,
    activeTenantId,
    permissions: DEMO_ROLE_PERMISSIONS[role],
    demo: true,
  };
}
