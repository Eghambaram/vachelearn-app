import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DemoBadge } from '@/components/demo-badge';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { StatusBadge } from '@/components/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CertificateDetail } from '@/features/learn/certificates/certificate-detail';
import { parseDemoState } from '@/lib/api/client';
import { getMyCertificate } from '@/lib/api/learner';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const c = t.certificates;

type Props = {
  params: Promise<{ awardId: string }>;
  searchParams: Promise<{ demoState?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await getMyCertificate((await params).awardId);
  return {
    title: result.ok ? result.data.award.courseTitle : t.system.notFoundTitle,
    robots: { index: false, follow: false },
  };
}

/** One of the learner's own certificates (UI spec #43). Anyone else's award id is a 404 in every demo state. */
export default async function CertificatePage({ params, searchParams }: Props) {
  const session = await getSession();
  const demoState = session.demo ? parseDemoState((await searchParams).demoState) : 'ready';
  const result = await getMyCertificate((await params).awardId, {
    demoState: demoState === 'loading' ? 'ready' : demoState,
  });
  if (!result.ok) {
    if (result.status === 404) notFound();
    if (result.status === 403) return <PermissionDenied headingLevel="h1" />;
    return <ErrorState requestId={result.error.requestId} />;
  }
  const { award } = result.data;
  return (
    <>
      <PageHeader
        title={award.courseTitle}
        breadcrumbs={[
          { label: t.nav.dashboard, href: '/learn' },
          { label: c.title, href: '/learn/certificates' },
          { label: award.courseTitle },
        ]}
        meta={
          <>
            <StatusBadge entity="certificate" status={award.status} />
            {session.demo ? <DemoBadge /> : null}
          </>
        }
        description={c.version(award.courseVersion)}
      />
      {demoState === 'loading' ? (
        <div role="status" aria-label={t.common.loading} className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <CertificateDetail data={result.data} />
      )}
    </>
  );
}
