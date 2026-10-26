import type { Workspace } from '@/lib/api/session-types';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/*
 * Workspace navigation (UI spec §Screen inventory). Each item names the permission key that lets a role see it
 * (docs/ROLE_PERMISSION_MATRIX.md) — hiding an item is never authorization; the API re-checks every request.
 * Items for screens not built yet open a "Planned for slice N" page (D-061); `slice` says which slice builds the
 * screen (demo screens in 1.5, real ones later). Feature-flagged screens (classroom, surveys, commerce — D-031) and
 * undecided ones (D-027 usage, D-043 candidates) are left out until their flag or decision exists.
 */

/** Icon names resolved to lucide components on the client (components cannot cross the server/client boundary). */
export type NavIcon =
  | 'dashboard'
  | 'building'
  | 'users'
  | 'shield'
  | 'history'
  | 'settings'
  | 'branch'
  | 'group'
  | 'mail'
  | 'book'
  | 'assign'
  | 'progress'
  | 'quiz'
  | 'certificate'
  | 'compliance'
  | 'report'
  | 'chart'
  | 'download'
  | 'calendar'
  | 'catalog';

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: NavIcon;
  permission: string;
  /** The slice that builds this screen, e.g. "1.5" (demo) or "2.2". */
  slice: string;
  /** Other path prefixes that belong to this item (e.g. the player belongs to "My learning"). */
  matches?: readonly string[];
};

export const NAV: Record<Workspace, readonly NavItem[]> = {
  platform: [
    {
      id: 'dashboard',
      label: t.nav.dashboard,
      href: '/platform',
      icon: 'dashboard',
      permission: 'analytics.read',
      slice: '1.5',
    },
    {
      id: 'tenants',
      label: t.nav.tenants,
      href: '/platform/tenants',
      icon: 'building',
      permission: 'tenant.read',
      slice: '2.2',
    },
    {
      id: 'platform-users',
      label: t.nav.platformUsers,
      href: '/platform/users',
      icon: 'shield',
      permission: 'platform_user.manage',
      slice: '2.4',
    },
    {
      id: 'audit',
      label: t.nav.platformAudit,
      href: '/platform/audit',
      icon: 'history',
      permission: 'platform.audit.read',
      slice: '2.2',
    },
    {
      id: 'settings',
      label: t.nav.platformSettings,
      href: '/platform/settings',
      icon: 'settings',
      permission: 'platform.settings.read',
      slice: '7.4',
    },
  ],
  admin: [
    {
      id: 'dashboard',
      label: t.nav.dashboard,
      href: '/admin',
      icon: 'dashboard',
      permission: 'report.read',
      slice: '1.5',
    },
    {
      id: 'branches',
      label: t.nav.branches,
      href: '/admin/branches',
      icon: 'branch',
      permission: 'branch.read',
      slice: '2.5',
    },
    {
      id: 'users',
      label: t.nav.users,
      href: '/admin/users',
      icon: 'users',
      permission: 'user.read',
      slice: '2.5',
    },
    {
      id: 'groups',
      label: t.nav.groups,
      href: '/admin/groups',
      icon: 'group',
      permission: 'group.read',
      slice: '3.2',
    },
    {
      id: 'roles',
      label: t.nav.roles,
      href: '/admin/roles',
      icon: 'shield',
      permission: 'role.assign',
      slice: '2.4',
    },
    {
      id: 'invitations',
      label: t.nav.invitations,
      href: '/admin/invitations',
      icon: 'mail',
      permission: 'invitation.read',
      slice: '3.1',
    },
    {
      id: 'courses',
      label: t.nav.courses,
      href: '/admin/courses',
      icon: 'book',
      permission: 'course.read',
      slice: '1.5',
    },
    {
      id: 'assignments',
      label: t.nav.assignments,
      href: '/admin/assignments',
      icon: 'assign',
      permission: 'assignment.create',
      slice: '4.1',
    },
    {
      id: 'progress',
      label: t.nav.progress,
      href: '/admin/progress',
      icon: 'progress',
      permission: 'enrollment.read',
      slice: '4.7',
    },
    {
      id: 'assessments',
      label: t.nav.assessments,
      href: '/admin/assessments',
      icon: 'quiz',
      permission: 'assessment.manage',
      slice: '4.4',
    },
    {
      id: 'certificates',
      label: t.nav.certificates,
      href: '/admin/certificates',
      icon: 'certificate',
      permission: 'certificate.read',
      slice: '4.6',
    },
    {
      id: 'compliance',
      label: t.nav.compliance,
      href: '/admin/compliance',
      icon: 'compliance',
      permission: 'compliance.read',
      slice: '5.1',
    },
    {
      id: 'reports',
      label: t.nav.reports,
      href: '/admin/reports',
      icon: 'report',
      permission: 'report.read',
      slice: '1.5',
    },
    {
      id: 'analytics',
      label: t.nav.analytics,
      href: '/admin/analytics',
      icon: 'chart',
      permission: 'analytics.read',
      slice: '6.4',
    },
    {
      id: 'exports',
      label: t.nav.exports,
      href: '/admin/exports',
      icon: 'download',
      permission: 'report.export',
      slice: '5.3',
    },
    {
      id: 'audit',
      label: t.nav.audit,
      href: '/admin/audit',
      icon: 'history',
      permission: 'audit.read',
      slice: '2.6',
    },
    {
      id: 'settings',
      label: t.nav.settings,
      href: '/admin/settings',
      icon: 'settings',
      permission: 'tenant_settings.read',
      slice: '2.5',
    },
  ],
  instructor: [
    {
      id: 'dashboard',
      label: t.nav.dashboard,
      href: '/instructor',
      icon: 'dashboard',
      permission: 'class_session.manage',
      slice: '5.5',
    },
    {
      id: 'sessions',
      label: t.nav.sessions,
      href: '/instructor/sessions',
      icon: 'calendar',
      permission: 'attendance.record',
      slice: '5.5',
    },
    {
      id: 'courses',
      label: t.nav.courses,
      href: '/instructor/courses',
      icon: 'book',
      permission: 'course.read',
      slice: '5.5',
    },
    {
      id: 'results',
      label: t.nav.results,
      href: '/instructor/results',
      icon: 'quiz',
      permission: 'attempt.review',
      slice: '4.4',
    },
  ],
  learn: [
    {
      id: 'dashboard',
      label: t.nav.dashboard,
      href: '/learn',
      icon: 'dashboard',
      permission: 'enrollment.read',
      slice: '1.5',
    },
    {
      id: 'my-learning',
      label: t.nav.myLearning,
      href: '/learn/my-learning',
      matches: ['/learn/courses', '/learn/attempts'],
      icon: 'progress',
      permission: 'enrollment.read',
      slice: '4.2',
    },
    {
      id: 'catalog',
      label: t.nav.catalog,
      href: '/learn/catalog',
      icon: 'catalog',
      permission: 'catalog.browse',
      slice: '3.7',
    },
    {
      id: 'certificates',
      label: t.nav.myCertificates,
      href: '/learn/certificates',
      icon: 'certificate',
      permission: 'certificate.read',
      slice: '1.5',
    },
  ],
};

/** The items a session may see in a workspace, in definition order. */
export function navFor(workspace: Workspace, permissions: readonly string[]): NavItem[] {
  const granted = new Set(permissions);
  return NAV[workspace].filter((item) => granted.has(item.permission));
}

/** The nav item whose page this exact path is (placeholder pages exist only for these). */
export function findNavItem(workspace: Workspace, pathname: string): NavItem | undefined {
  return NAV[workspace].find((item) => item.href === pathname);
}

/** The item to mark current: the longest href that equals the path or is a parent segment of it. */
export function activeNavId(items: readonly NavItem[], pathname: string): string | undefined {
  const under = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  const score = (item: NavItem) =>
    Math.max(...[item.href, ...(item.matches ?? [])].map((p) => (under(p) ? p.length : -1)));
  return items.filter((item) => score(item) >= 0).sort((a, b) => score(b) - score(a))[0]?.id;
}
