import { ReloadButton } from '@/components/reload-button';
import type { Metadata } from 'next';
import { DemoBadge } from '@/components/demo-badge';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { Skeleton } from '@/components/ui/skeleton';
import { CertificateList } from '@/features/learn/certificates/certificate-list';
import { parseDemoState } from '@/lib/api/client';
import { getMyCertificates } from '@/lib/api/learner';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const c = t.certificates;

// Holds the learner's name and certificate ids: never indexed.
export const metadata: Metadata = { title: c.title, robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ demoState?: string }> };

/** My certificates (UI spec #43): the learner's own awards, newest first. */
export default async function MyCertificatesPage({ searchParams }: Props) {
  const session = await getSession();
  const demoState = session.demo ? parseDemoState((await searchParams).demoState) : 'ready';
  const header = (
    <PageHeader
      title={c.title}
      description={c.description}
      breadcrumbs={[{ label: t.nav.dashboard, href: '/learn' }, { label: c.title }]}
      meta={session.demo ? <DemoBadge /> : null}
    />
  );
  if (demoState === 'loading') {
    return (
      <>
        {header}
        <div role="status" aria-label={t.common.loading} className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </>
    );
  }
  const result = await getMyCertificates({ demoState });
  if (!result.ok) {
    return result.status === 403 ? (
      <PermissionDenied headingLevel="h1" />
    ) : (
      <>
        {header}
        <ErrorState requestId={result.error.requestId} action={<ReloadButton />} />
      </>
    );
  }
  return (
    <>
      {header}
      <CertificateList data={result.data} />
    </>
  );
}
