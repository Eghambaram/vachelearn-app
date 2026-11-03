import type { Metadata } from 'next';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { ReloadButton } from '@/components/reload-button';
import { RealDataOnly } from '@/features/people/real-data-only';
import { JobRoles } from '@/features/tenancy/job-roles';
import { SettingsNav } from '@/features/tenancy/settings-nav';
import { readJobRoles } from '@/lib/api/tenancy-server';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const j = t.jobRoles;

export const metadata: Metadata = { title: j.title };

export const dynamic = 'force-dynamic';

/** Job roles (UI spec #53; D-047; Slice 2.5c): read with `tenant_settings.read`, changed with `reference_data.manage`. */
export default async function JobRolesPage() {
  const session = await getSession();
  if (session.demo) return <RealDataOnly />;
  const perms = new Set(session.permissions);
  if (!perms.has('tenant_settings.read')) return <PermissionDenied headingLevel="h1" />;
  const result = await readJobRoles({ limit: '25' });
  if (!result.ok && result.status === 403) return <PermissionDenied headingLevel="h1" />;
  return (
    <>
      <PageHeader title={t.settings.title} description={j.description} />
      <SettingsNav current="/admin/settings/people" />
      {result.ok ? (
        <JobRoles initial={result.data} editable={perms.has('reference_data.manage')} />
      ) : (
        <ErrorState
          requestId={result.error.requestId === 'none' ? undefined : result.error.requestId}
          action={<ReloadButton />}
        />
      )}
    </>
  );
}
