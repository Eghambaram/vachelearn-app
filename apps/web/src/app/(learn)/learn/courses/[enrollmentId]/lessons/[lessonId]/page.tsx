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
import { CoursePlayer } from '@/features/learn/player/course-player';
import { parseDemoState } from '@/lib/api/client';
import { getCoursePlayer, getLessonView } from '@/lib/api/learner';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

type Props = {
  params: Promise<{ enrollmentId: string; lessonId: string }>;
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
  const { enrollmentId, lessonId } = await params;
  const session = await getSession();
  const demoState = session.demo ? parseDemoState((await searchParams).demoState) : 'ready';
  const result = await getCoursePlayer(enrollmentId, {
    demoState: demoState === 'loading' ? 'ready' : demoState,
  });
  const lesson = result.ok
    ? result.data.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId)
    : undefined;
  if (result.ok && !lesson) return { title: t.system.notFoundTitle };
  return {
    title: titleFor(
      result,
      lesson && result.ok ? `${lesson.title} · ${result.data.enrollment.courseTitle}` : '',
    ),
  };
}

/**
 * Course player (UI spec #41, ref 13) for one lesson of the learner's own enrollment. Someone else's enrollment, or a
 * lesson outside the enrolled version, is a 404. `?demoState=empty` has no meaning here (a published version always
 * has lessons) and shows the ready state.
 */
export default async function LessonPage({ params, searchParams }: Props) {
  const session = await getSession();
  const demoState = session.demo ? parseDemoState((await searchParams).demoState) : 'ready';
  const { enrollmentId, lessonId } = await params;

  // The lesson read checks ownership and the pinned version, so an id that is not the learner's stays a 404 in every
  // demo state (including loading).
  const lesson = await getLessonView(enrollmentId, lessonId);
  if (!lesson.ok) {
    if (lesson.status === 404) notFound();
    if (lesson.status === 403) return <PermissionDenied headingLevel="h1" />;
  }

  if (demoState === 'loading') {
    return (
      <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  const outline = await getCoursePlayer(enrollmentId, { demoState });
  if (!outline.ok) {
    if (outline.status === 404) notFound();
    if (outline.status === 403) return <PermissionDenied headingLevel="h1" />;
    return (
      <ErrorState
        headingLevel="h1"
        requestId={outline.error.requestId}
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
  if (!lesson.ok) notFound();

  const { enrollment } = outline.data;
  return (
    <>
      <PageHeader
        title={enrollment.courseTitle}
        breadcrumbs={[
          { label: t.nav.dashboard, href: '/learn' },
          { label: enrollment.courseTitle },
        ]}
        meta={
          <>
            <StatusBadge entity="enrollment" status={enrollment.status} />
            {session.demo ? <DemoBadge /> : null}
          </>
        }
        description={t.learnerDashboard.version(enrollment.courseVersion)}
      />
      <CoursePlayer outline={outline.data} lesson={lesson.data} />
    </>
  );
}
