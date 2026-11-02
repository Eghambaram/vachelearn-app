import type { Metadata } from 'next';
import Link from 'next/link';
import type { TenantRoleKey } from '@vachelearn/contracts';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const r = t.rolesReference;

export const metadata: Metadata = { title: r.title };

const ROLES: readonly TenantRoleKey[] = [
  'tenant_admin',
  'branch_admin',
  'learning_manager',
  'compliance_viewer',
  'instructor',
  'learner',
];

/**
 * The fixed tenant roles (D-053), read-only (D-107): what each can do and where it applies. Roles are assigned on each
 * user's page. Shown to those who may assign roles (`role.assign`, the nav item's permission).
 */
export default async function RolesPage() {
  const session = await getSession();
  if (!session.permissions.includes('role.assign')) return <PermissionDenied headingLevel="h1" />;
  return (
    <>
      <PageHeader title={r.title} description={r.description} />
      <dl className="grid max-w-3xl gap-4">
        {ROLES.map((role) => (
          <div key={role} className="rounded-xl border bg-card p-4">
            <dt className="font-semibold">{t.roles[role]}</dt>
            <dd className="mt-1 text-sm text-muted-foreground">{r.summaries[role]}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="roles-scope" className="flex max-w-3xl flex-col gap-2">
        <h2 id="roles-scope" className="text-lg font-semibold">
          {r.scopeTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{r.scopeBody}</p>
        <p className="text-sm">
          {r.manage}{' '}
          {session.permissions.includes('user.read') ? (
            <Link
              href="/admin/users"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {r.goToUsers}
            </Link>
          ) : null}
        </p>
      </section>
    </>
  );
}
