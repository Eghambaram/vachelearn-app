import {
  courseProgress,
  CoursePlayer,
  enrollmentDisplayStatus,
  LearnerDashboard,
  LessonView,
  resumeLesson,
  type CoursePlayer as CoursePlayerData,
  type LearnerDashboard as LearnerDashboardData,
  type LessonView as LessonViewData,
} from '@vachelearn/contracts';
import { calendarDateIn, daysBetween } from '@/lib/format';
import { demoLessonContent } from '@/mocks/course-player';
import { demoEnrollments, type DemoEnrollment } from '@/mocks/enrollments';
import { DEMO_TENANT_ZONE } from '@/mocks/tenant-dashboard';
import { demoError, type ApiResult, type DemoState } from './client';
import { getSession } from './session';

/*
 * The learner's own learning: GET /api/v1/me/dashboard and, for the player, GET /api/v1/me/enrollments/:id/outline
 * and …/lessons/:lessonId (contracts `course-player.ts`). The user and tenant come from the session only — there is no parameter that could name someone else. Phase 1 serves the demo fixture through
 * the shared contract and the shared D-054 status rule; Phase 4 serves the same shapes from the API.
 */

function notFound(): ApiResult<never> {
  return {
    ok: false,
    status: 404,
    error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'req_demo_0404' },
  };
}

async function ownEnrollments(now: Date) {
  const session = await getSession();
  // Every member's own learning is readable with `enrollment.read`; the user filter below is what keeps it "own".
  if (!session.activeTenantId || !session.permissions.includes('enrollment.read')) return null;
  const mine = demoEnrollments(session.activeTenantId, now).filter(
    (e) => e.userId === session.user.id,
  );
  return { session, mine };
}

export async function getLearnerDashboard({
  demoState = 'ready',
  now = new Date(),
}: { demoState?: DemoState; now?: Date } = {}): Promise<ApiResult<LearnerDashboardData>> {
  const own = await ownEnrollments(now);
  if (demoState === 'forbidden' || !own) return demoError(403);
  if (demoState === 'error') return demoError(500);
  const timeZone = DEMO_TENANT_ZONE;
  const today = calendarDateIn(now, timeZone);
  const active = (demoState === 'empty' ? [] : own.mine)
    .filter((e) => e.status !== 'cancelled')
    .map((e) => ({ ...e, display: enrollmentDisplayStatus(e.status, e.dueOn, today) }));

  const count = (display: string) => active.filter((e) => e.display === display).length;
  const byActivity = (a: DemoEnrollment, b: DemoEnrollment) =>
    (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '');

  return {
    ok: true,
    data: LearnerDashboard.parse({
      generatedAt: now.toISOString(),
      timeZone,
      learner: { displayName: own.session.user.displayName },
      summary: {
        notStarted: count('not_started'),
        inProgress: count('in_progress'),
        overdue: count('overdue'),
        completed: count('completed'),
      },
      continueLearning: active
        .filter((e) => e.status === 'in_progress')
        .sort(byActivity)
        .slice(0, 4)
        .map((e) => ({
          enrollmentId: e.id,
          courseTitle: e.courseTitle,
          courseVersion: e.courseVersion,
          status: e.display,
          progressPercent: e.progressPercent,
          nextLessonTitle: e.nextLessonTitle,
          dueOn: e.dueOn,
          lastActivityAt: e.lastActivityAt,
        })),
      deadlines: active
        .filter(
          (e) => e.status !== 'completed' && e.dueOn !== null && daysBetween(today, e.dueOn) <= 30,
        )
        .sort((a, b) => a.dueOn!.localeCompare(b.dueOn!))
        .slice(0, 5)
        .map((e) => ({
          enrollmentId: e.id,
          courseTitle: e.courseTitle,
          dueOn: e.dueOn!,
          status: e.display,
        })),
      recentlyCompleted: active
        .filter((e) => e.status === 'completed' && e.completedAt)
        .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))
        .slice(0, 3)
        .map((e) => ({
          enrollmentId: e.id,
          courseTitle: e.courseTitle,
          completedAt: e.completedAt!,
          certificate: e.certificate,
        })),
    }),
  };
}

/**
 * One of the caller's own enrollments. Anyone else's id, a cancelled one or an unknown one is 404, so existence never
 * leaks. Completed enrollments stay open for review.
 */
async function myEnrollment(enrollmentId: string, now: Date) {
  const own = await ownEnrollments(now);
  if (!own) return { result: demoError(403) };
  const enrollment = own.mine.find((e) => e.id === enrollmentId && e.status !== 'cancelled');
  return enrollment ? { enrollment } : { result: notFound() };
}

/** The player outline: the pinned version's modules and lessons with the learner's progress (UI spec #41). */
export async function getCoursePlayer(
  enrollmentId: string,
  { demoState = 'ready', now = new Date() }: { demoState?: DemoState; now?: Date } = {},
): Promise<ApiResult<CoursePlayerData>> {
  // Ownership first: a demo state never turns someone else's (404) enrollment into another answer.
  const { enrollment, result } = await myEnrollment(enrollmentId, now);
  if (!enrollment) return result;
  if (demoState === 'forbidden') return demoError(403);
  if (demoState === 'error') return demoError(500);
  const timeZone = DEMO_TENANT_ZONE;
  const progress = courseProgress(enrollment.modules.flatMap((m) => m.lessons));
  return {
    ok: true,
    data: CoursePlayer.parse({
      generatedAt: now.toISOString(),
      timeZone,
      enrollment: {
        id: enrollment.id,
        courseTitle: enrollment.courseTitle,
        courseVersion: enrollment.courseVersion,
        status: enrollmentDisplayStatus(
          enrollment.status,
          enrollment.dueOn,
          calendarDateIn(now, timeZone),
        ),
        dueOn: enrollment.dueOn,
        progressPercent: progress.percent,
        requiredLessons: progress.requiredLessons,
        requiredCompleted: progress.requiredCompleted,
      },
      resumeLessonId: resumeLesson(enrollment.modules).id,
      modules: enrollment.modules,
    }),
  };
}

/** One lesson of the caller's own enrollment. A lesson outside the enrolled version is 404, like the enrollment. */
export async function getLessonView(
  enrollmentId: string,
  lessonId: string,
  { now = new Date() }: { now?: Date } = {},
): Promise<ApiResult<LessonViewData>> {
  const { enrollment, result } = await myEnrollment(enrollmentId, now);
  if (!enrollment) return result;
  const lesson = enrollment.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId);
  if (!lesson) return notFound();
  const completedAt = lesson.progress === 'completed' ? enrollment.lastActivityAt : null;
  const content = demoLessonContent(lesson, enrollment.seed);
  return {
    ok: true,
    data: LessonView.parse({
      lessonId: lesson.id,
      summary: `Demo summary: what “${lesson.title}” covers and what you will be able to do after it.`,
      completedAt,
      content: content.type === 'document' ? { ...content, acknowledgedAt: completedAt } : content,
    }),
  };
}
