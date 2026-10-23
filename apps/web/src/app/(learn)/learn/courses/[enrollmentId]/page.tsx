import { notFound, redirect } from 'next/navigation';
import { PermissionDenied } from '@/components/permission-denied';
import { ErrorState } from '@/components/error-state';
import { lessonHref } from '@/features/learn/player/paths';
import { parseDemoState } from '@/lib/api/client';
import { getCoursePlayer } from '@/lib/api/learner';
import { getSession } from '@/lib/api/session';

type Props = {
  params: Promise<{ enrollmentId: string }>;
  searchParams: Promise<{ demoState?: string }>;
};

/**
 * "Continue" lands here and is sent on to the lesson the server says to resume (UI spec #41). Only the learner's own
 * enrollment resolves; anyone else's id is a 404.
 */
export default async function ResumeCourse({ params, searchParams }: Props) {
  const session = await getSession();
  const demoState = session.demo ? parseDemoState((await searchParams).demoState) : 'ready';
  const { enrollmentId } = await params;
  const result = await getCoursePlayer(enrollmentId, {
    demoState: demoState === 'loading' ? 'ready' : demoState,
  });
  if (!result.ok) {
    if (result.status === 404) notFound();
    if (result.status === 403) return <PermissionDenied headingLevel="h1" />;
    return <ErrorState requestId={result.error.requestId} />;
  }
  const query = demoState === 'ready' ? '' : `?demoState=${demoState}`;
  redirect(`${lessonHref(enrollmentId, result.data.resumeLessonId)}${query}`);
}
