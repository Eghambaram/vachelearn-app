import {
  AttemptView,
  CertificateDetail,
  certificateDisplayStatus,
  MyCertificates,
  scoreAttempt,
  canStartAttempt,
  courseProgress,
  CoursePlayer,
  enrollmentDisplayStatus,
  LearnerDashboard,
  LessonView,
  resumeLesson,
  type AttemptSummary,
  type AttemptView as AttemptViewData,
  type CertificateDetail as CertificateDetailData,
  type MyCertificates as MyCertificatesData,
  type CoursePlayer as CoursePlayerData,
  type LearnerDashboard as LearnerDashboardData,
  type LessonView as LessonViewData,
} from '@vachelearn/contracts';
import { calendarDateIn, daysBetween } from '@/lib/format';
import { DEMO_ASSESSMENT, DEMO_QUESTIONS, demoAttempts, type DemoAttempt } from '@/mocks/attempts';
import { currentAward, demoAwards, issuerName, type DemoAward } from '@/mocks/certificates';
import { demoLessonContent } from '@/mocks/course-player';
import { catalogCourse } from '@/mocks/catalog';
import { catalogEnrollment, demoEnrollments, type DemoEnrollment } from '@/mocks/enrollments';
import { DEMO_TENANT_ZONE } from '@/mocks/tenant-dashboard';
import { demoError, type ApiResult, type DemoState } from './client';
import { getContentSession } from './content-session';
import { readDemoEnrolments } from './demo-enrolments';

/*
 * The learner's own learning: GET /api/v1/me/dashboard; for the player GET /api/v1/me/enrollments/:id/outline and
 * …/lessons/:lessonId (contracts `course-player.ts`); for assessments GET /api/v1/me/attempts/:id
 * (`assessment-attempt.ts`). The user and tenant come from the session only — there is no parameter that could name
 * someone else. Phase 1 serves the demo fixtures through the shared contracts and rules; Phase 4 serves the same
 * shapes from the API.
 */

function notFound(): ApiResult<never> {
  return {
    ok: false,
    status: 404,
    error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'req_demo_0404' },
  };
}

/** The signed-in learner's sample enrolments (fixtures + demo catalog), or null without `enrollment.read`. */
export async function ownEnrollments(now: Date) {
  const session = await getContentSession();
  // Every member's own learning is readable with `enrollment.read`; the user filter below is what keeps it "own".
  if (!session.activeTenantId || !session.permissions.includes('enrollment.read')) return null;
  const fixtures = demoEnrollments(session.activeTenantId, now).filter(
    (e) => e.userId === session.user.id,
  );
  // Demo catalog enrolments (D-110): courses of this tenant's catalog only, and not ones already held.
  const held = new Set(fixtures.filter((e) => e.status !== 'cancelled').map((e) => e.courseTitle));
  const tenantId = session.activeTenantId;
  const enrolled = (await readDemoEnrolments())
    .map((courseId) => catalogCourse(tenantId, courseId, now))
    .filter((course) => course !== null && !held.has(course.title))
    .map((course, i) => catalogEnrollment(tenantId, session.user.id, course!, i));
  return { session, mine: [...enrolled, ...fixtures] };
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
          certificate: (() => {
            const award = currentAward(e);
            return award ? { awardId: award.id, issuedAt: award.issuedAt } : null;
          })(),
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
      content:
        content.type === 'document'
          ? { ...content, acknowledgedAt: completedAt }
          : content.type === 'assessment'
            ? withAttempts(content, demoAttempts(enrollment, now.getTime()))
            : content,
    }),
  };
}

function attemptSummary(attempt: DemoAttempt): AttemptSummary {
  return {
    id: attempt.id,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    scorePercentTenths:
      attempt.status === 'in_progress'
        ? null
        : scoreAttempt(DEMO_QUESTIONS, attempt.answers, DEMO_ASSESSMENT.passMarkPercent)
            .scorePercentTenths,
    timedOut: attempt.timedOut,
  };
}

function withAttempts<C extends { attemptLimit: number | null }>(
  content: C,
  attempts: DemoAttempt[],
) {
  const history = attempts.map(attemptSummary);
  return {
    ...content,
    attempts: history,
    canStartAttempt: canStartAttempt(history, content.attemptLimit),
  };
}

/**
 * One of the caller's own assessment attempts (UI spec #42). Found only among the attempts of the caller's own,
 * non-cancelled enrollments, so anyone else's attempt id is a 404 in every demo state. An open attempt carries the
 * questions without the answer key (D-023) and the answers the server already holds; a graded one carries the score
 * only.
 */
export async function getAttempt(
  attemptId: string,
  { demoState = 'ready', now = new Date() }: { demoState?: DemoState; now?: Date } = {},
): Promise<ApiResult<AttemptViewData>> {
  const own = await ownEnrollments(now);
  if (!own) return demoError(403);
  const found = own.mine
    .filter((e) => e.status !== 'cancelled')
    .flatMap((enrollment) =>
      demoAttempts(enrollment, now.getTime()).map((attempt, _, all) => ({
        enrollment,
        attempt,
        all,
      })),
    )
    .find((entry) => entry.attempt.id === attemptId);
  if (!found) return notFound();
  if (demoState === 'forbidden') return demoError(403);
  if (demoState === 'error') return demoError(500);

  const { enrollment, attempt, all } = found;
  const history = all.map(attemptSummary);
  return {
    ok: true,
    data: AttemptView.parse({
      generatedAt: now.toISOString(),
      timeZone: DEMO_TENANT_ZONE,
      enrollment: {
        id: enrollment.id,
        courseTitle: enrollment.courseTitle,
        lessonId: attempt.lessonId,
      },
      assessment: { ...DEMO_ASSESSMENT, questionCount: DEMO_QUESTIONS.length },
      attempt: { ...attemptSummary(attempt), deadlineAt: attempt.deadlineAt },
      history,
      canRetake: canStartAttempt(history, DEMO_ASSESSMENT.attemptLimit),
      body:
        attempt.status === 'in_progress'
          ? {
              kind: 'taking',
              // The answer key stays on the server: only the learner-facing fields are copied (D-023).
              questions: DEMO_QUESTIONS.map(({ id, type, stem, points, options }) => ({
                id,
                type,
                stem,
                points,
                options,
              })),
              savedAnswers: attempt.answers,
            }
          : {
              kind: 'result',
              score: scoreAttempt(DEMO_QUESTIONS, attempt.answers, DEMO_ASSESSMENT.passMarkPercent),
            },
    }),
  };
}

function myCertificateItem(award: DemoAward, now: Date) {
  return {
    awardId: award.id,
    enrollmentId: award.enrollmentId,
    courseTitle: award.courseTitle,
    courseVersion: award.courseVersion,
    status: certificateDisplayStatus(award.status, award.expiresAt, now),
    issuedAt: award.issuedAt,
    expiresAt: award.expiresAt,
    verificationId: award.verificationId,
  };
}

/** Own awards in the active tenant, newest first; revoked and superseded ones stay listed (evidence is kept). */
async function myAwards(now: Date) {
  const own = await ownEnrollments(now);
  if (!own || !own.session.permissions.includes('certificate.read')) return null;
  return {
    session: own.session,
    awards: own.mine
      .flatMap((e) => demoAwards(e))
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
  };
}

/** GET /api/v1/me/certificates (UI spec #43). One page: a learner holds few awards; the cursor stays for the API. */
export async function getMyCertificates({
  demoState = 'ready',
  now = new Date(),
}: { demoState?: DemoState; now?: Date } = {}): Promise<ApiResult<MyCertificatesData>> {
  const mine = await myAwards(now);
  if (demoState === 'forbidden' || !mine) return demoError(403);
  if (demoState === 'error') return demoError(500);
  const awards = demoState === 'empty' ? [] : mine.awards;
  return {
    ok: true,
    data: MyCertificates.parse({
      data: awards.map((a) => myCertificateItem(a, now)),
      page: { nextCursor: null, limit: 25 },
      timeZone: DEMO_TENANT_ZONE,
    }),
  };
}

/** GET /api/v1/me/certificates/:awardId — own award only; anyone else's or an unknown id is a 404 in every state. */
export async function getMyCertificate(
  awardId: string,
  { demoState = 'ready', now = new Date() }: { demoState?: DemoState; now?: Date } = {},
): Promise<ApiResult<CertificateDetailData>> {
  const mine = await myAwards(now);
  if (!mine) return demoError(403);
  const award = mine.awards.find((a) => a.id === awardId);
  if (!award) return notFound();
  if (demoState === 'forbidden') return demoError(403);
  if (demoState === 'error') return demoError(500);
  return {
    ok: true,
    data: CertificateDetail.parse({
      generatedAt: now.toISOString(),
      timeZone: DEMO_TENANT_ZONE,
      award: {
        ...myCertificateItem(award, now),
        completedAt: award.completedAt,
        revokedAt: award.revokedAt,
        supersededAt: award.supersededAt,
        replacedByAwardId: award.replacedByAwardId,
      },
      holderName: mine.session.user.displayName,
      issuerName: issuerName(award.tenantId),
    }),
  };
}

/** One row of My learning (sample data, D-110): the learner's own live enrolments with server-computed status. */
export type MyLearningItem = {
  enrollmentId: string;
  courseTitle: string;
  courseVersion: number;
  status: ReturnType<typeof enrollmentDisplayStatus>;
  progressPercent: number;
  nextLessonTitle: string | null;
  dueOn: string | null;
  completedAt: string | null;
  lessonCount: number;
};

const MY_LEARNING_ORDER = ['overdue', 'in_progress', 'not_started', 'completed'] as const;

/** My learning (UI spec #40): every own enrolment that is not cancelled, most urgent first. */
export async function getMyLearning(
  now = new Date(),
): Promise<ApiResult<{ items: MyLearningItem[]; today: string; timeZone: string }>> {
  const own = await ownEnrollments(now);
  if (!own) return demoError(403);
  const timeZone = DEMO_TENANT_ZONE;
  const today = calendarDateIn(now, timeZone);
  const items = own.mine
    .filter((e) => e.status !== 'cancelled')
    .map((e): MyLearningItem => ({
      enrollmentId: e.id,
      courseTitle: e.courseTitle,
      courseVersion: e.courseVersion,
      status: enrollmentDisplayStatus(e.status, e.dueOn, today),
      progressPercent: e.progressPercent,
      nextLessonTitle: e.status === 'not_started' ? null : e.nextLessonTitle,
      dueOn: e.dueOn,
      completedAt: e.completedAt,
      lessonCount: e.modules.flatMap((m) => m.lessons).length,
    }))
    .sort(
      (a, b) =>
        MY_LEARNING_ORDER.indexOf(a.status as (typeof MY_LEARNING_ORDER)[number]) -
          MY_LEARNING_ORDER.indexOf(b.status as (typeof MY_LEARNING_ORDER)[number]) ||
        (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999'),
    );
  return { ok: true, data: { items, today, timeZone } };
}
