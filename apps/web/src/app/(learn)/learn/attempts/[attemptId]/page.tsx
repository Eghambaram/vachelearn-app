import { ReloadButton } from '@/components/reload-button';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DemoBadge } from '@/components/demo-badge';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { StatusBadge } from '@/components/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AttemptResult } from '@/features/learn/attempt/attempt-result';
import { AttemptTaker } from '@/features/learn/attempt/attempt-taker';
import { lessonHref } from '@/features/learn/player/paths';
import { parseDemoState } from '@/lib/api/client';
import { getAttempt } from '@/lib/api/learner';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const a = t.attempt;

type Props = {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ demoState?: string }>;
};

function titleFor(result: { ok: boolean; status?: number }, title: string) {
  if (result.ok) return title;
  return result.status === 404
    ? t.system.notFoundTitle
    : result.status === 403
      ? t.states.deniedTitle
      : t.states.errorTitle;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const session = await getSession();
  const demoState = session.demo ? parseDemoState((await searchParams).demoState) : 'ready';
  const result = await getAttempt((await params).attemptId, {
    demoState: demoState === 'loading' ? 'ready' : demoState,
  });
  return { title: titleFor(result, result.ok ? result.data.assessment.title : '') };
}

/**
 * Assessment taking and result (UI spec #42) for one of the learner's own attempts; anyone else's id is a 404 in every
 * demo state. `?demoState=empty` has no meaning here (an attempt always has questions) and shows the ready state.
 */
export default async function AttemptPage({ params, searchParams }: Props) {
  const session = await getSession();
  const demoState = session.demo ? parseDemoState((await searchParams).demoState) : 'ready';
  const result = await getAttempt((await params).attemptId, {
    demoState: demoState === 'loading' ? 'ready' : demoState,
  });
  if (!result.ok) {
    if (result.status === 404) notFound();
    if (result.status === 403) return <PermissionDenied headingLevel="h1" />;
    return (
      <ErrorState
        headingLevel="h1"
        requestId={result.error.requestId}
        action={
          <>
            <ReloadButton />
            <Button asChild variant="outline">
              <Link href="/learn">{t.player.backToDashboard}</Link>
            </Button>
          </>
        }
      />
    );
  }
  const data = result.data;
  const header = (
    <PageHeader
      title={data.assessment.title}
      breadcrumbs={[
        { label: t.nav.dashboard, href: '/learn' },
        {
          label: data.enrollment.courseTitle,
          href: lessonHref(data.enrollment.id, data.enrollment.lessonId),
        },
        { label: data.assessment.title },
      ]}
      meta={
        <>
          <StatusBadge entity="attempt" status={data.attempt.status} />
          {session.demo ? <DemoBadge /> : null}
        </>
      }
      description={`${a.attemptOf(data.attempt.attemptNumber, data.assessment.attemptLimit)} · ${a.versionPassMark(
        data.assessment.versionNumber,
        data.assessment.passMarkPercent,
      )}`}
    />
  );
  if (demoState === 'loading') {
    return (
      <>
        {header}
        <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-80 w-full" />
        </div>
      </>
    );
  }
  return (
    <>
      {header}
      {data.body.kind === 'taking' ? (
        <AttemptTaker data={{ ...data, body: data.body }} demo={session.demo} />
      ) : (
        <AttemptResult data={{ ...data, body: data.body }} />
      )}
    </>
  );
}
