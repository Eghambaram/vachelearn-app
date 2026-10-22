import {
  enrollmentDisplayStatus,
  LearnerDashboard,
  type LearnerDashboard as LearnerDashboardData,
} from '@vachelearn/contracts';
import { calendarDateIn, daysBetween } from '@/lib/format';
import { demoEnrollments, type DemoEnrollment } from '@/mocks/enrollments';
import { DEMO_TENANT_ZONE } from '@/mocks/tenant-dashboard';
import { demoError, type ApiResult, type DemoState } from './client';
import { getSession } from './session';

/*
 * The learner's own learning: GET /api/v1/me/dashboard and GET /api/v1/me/enrollments/:id. The user and tenant come
 * from the session only — there is no parameter that could name someone else. Phase 1 serves the demo fixture through
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

/** One of the caller's own enrollments. Anyone else's id — or an unknown one — is 404, so existence never leaks. */
export async function getMyEnrollment(
  enrollmentId: string,
  { now = new Date() }: { now?: Date } = {},
): Promise<ApiResult<{ courseTitle: string; courseVersion: number }>> {
  const own = await ownEnrollments(now);
  if (!own) return demoError(403);
  const enrollment = own.mine.find((e) => e.id === enrollmentId && e.status !== 'cancelled');
  if (!enrollment) return notFound();
  return {
    ok: true,
    data: { courseTitle: enrollment.courseTitle, courseVersion: enrollment.courseVersion },
  };
}
