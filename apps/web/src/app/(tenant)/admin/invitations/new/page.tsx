import type { Metadata } from 'next';
import type { TenantRoleKey } from '@vachelearn/contracts';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { ReloadButton } from '@/components/reload-button';
import { InviteForm } from '@/features/invitations/invite-form';
import { RealDataOnly } from '@/features/people/real-data-only';
import { readBranchOptions } from '@/lib/api/people-server';
import { getSession } from '@/lib/api/session';
import { readTenantSettings } from '@/lib/api/tenancy-server';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.invitations.dialogTitle };

export const dynamic = 'force-dynamic';

const BRANCH_ADMIN_ROLES: readonly TenantRoleKey[] = ['learner', 'instructor'];
const ALL_ROLES: readonly TenantRoleKey[] = [
  'learner',
  'instructor',
  'learning_manager',
  'compliance_viewer',
  'branch_admin',
  'tenant_admin',
];

/**
 * Invite a person (Slice 3.1). What is offered follows the granting rules; the API decides again. Only a Tenant Admin
 * holds `reference_data.manage`: the hint for whole-organisation roles (as on the user page).
 */
export default async function NewInvitationPage() {
  const session = await getSession();
  if (session.demo) return <RealDataOnly />;
  const perms = new Set(session.permissions);
  if (!perms.has('invitation.create')) return <PermissionDenied headingLevel="h1" />;
  const tenantWide = perms.has('reference_data.manage');
  const [branches, settings] = await Promise.all([
    readBranchOptions(),
    perms.has('tenant_settings.read') ? readTenantSettings() : null,
  ]);
  const header = (
    <PageHeader
      title={t.invitations.dialogTitle}
      breadcrumbs={[
        { label: t.invitations.title, href: '/admin/invitations' },
        { label: t.invitations.dialogTitle },
      ]}
    />
  );
  if (!branches.ok) {
    return (
      <>
        {header}
        <ErrorState
          requestId={branches.error.requestId === 'none' ? undefined : branches.error.requestId}
          action={<ReloadButton />}
        />
      </>
    );
  }
  return (
    <>
      {header}
      <InviteForm
        roles={tenantWide ? ALL_ROLES : BRANCH_ADMIN_ROLES}
        wholeOrganisation={tenantWide}
        scopeOptions={branches.data.data.map((b) => ({ id: b.id, label: `${b.name} (${b.code})` }))}
        expiryDays={settings?.ok ? settings.data.invitationExpiryDays : null}
      />
    </>
  );
}
