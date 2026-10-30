import type { Metadata } from 'next';
import Link from 'next/link';
import { TenantListPage } from '@vachelearn/contracts';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { ReloadButton } from '@/components/reload-button';
import { StartSupportForm } from '@/features/platform/start-support-form';
import { SupportEndedNotice } from '@/features/platform/support-ended-notice';
import { getSession } from '@/lib/api/session';
import { serverApiGet } from '@/lib/auth/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.shell.supportTitle };

// Per request: the platform tenant list and the support state come from the API.
export const dynamic = 'force-dynamic';

/**
 * Platform support sessions (D-037, D-098) — the first platform screen on the real API (2.4d). While a session is
 * live, the banner (app shell) shows it and ends it; here staff open one. The API checks the permission again on
 * every call; the check here only picks the right state to show.
 */
export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  const ended = (await searchParams).ended === '1';
  if (session.support) {
    return (
      <>
        <PageHeader title={t.shell.supportTitle} />
        <p>{t.shell.supportActive(session.support.tenantName)}</p>
      </>
    );
  }
  const header = (
    <>
      <PageHeader title={t.shell.supportTitle} />
      {ended ? <SupportEndedNotice /> : null}
    </>
  );
  const back = <Link href="/platform">{t.placeholder.back}</Link>;
  if (!session.permissions.includes('platform.support_access.start')) {
    return (
      <>
        {header}
        <PermissionDenied description={t.shell.supportDeniedBody} action={back} />
      </>
    );
  }
  const res = await serverApiGet(
    '/platform/tenants?limit=100&sort=displayName&direction=asc',
  ).catch(() => null);
  if (res?.status === 403) {
    return (
      <>
        {header}
        <PermissionDenied description={t.shell.supportDeniedBody} action={back} />
      </>
    );
  }
  const page = res?.ok ? TenantListPage.safeParse(await res.json()) : null;
  const tenants = page?.success
    ? page.data.data
        .filter((x) => x.status !== 'archived')
        .map((x) => ({ id: x.id, name: x.displayName }))
    : [];
  return (
    <>
      {header}
      <p className="max-w-2xl text-muted-foreground">{t.shell.supportIntro}</p>
      {!page?.success ? (
        <ErrorState
          title={t.shell.supportTenantsUnavailableTitle}
          description={t.shell.supportTenantsUnavailableBody}
          action={<ReloadButton />}
        />
      ) : tenants.length === 0 ? (
        <EmptyState title={t.shell.supportNoTenants} description={t.shell.supportNoTenantsBody} />
      ) : (
        <StartSupportForm tenants={tenants} />
      )}
    </>
  );
}
