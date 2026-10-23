import { z } from 'zod';
import { Count, IsoDate, IsoInstant } from './common';
import { LessonCompletionRule, LessonType } from './course-draft';
import { EnrollmentDisplayStatus } from './enrollment-status';
import { ProgressPercent } from './learner-dashboard';

/*
 * The course player (UI spec #41). Two reads, both for the signed-in learner's own enrollment only — any other id is
 * a 404, so existence never leaks:
 *   GET /api/v1/me/enrollments/:enrollmentId/outline              → CoursePlayer
 *   GET /api/v1/me/enrollments/:enrollmentId/lessons/:lessonId    → LessonView
 * The structure is the pinned course version (D-011). Lesson progress, course progress and the resume lesson are
 * computed by the server; the player only displays them. Opening a lesson never completes it (D-041): completion is a
 * separate write (Phase 4: POST …/lessons/:lessonId/complete, …/acknowledge, throttled video position updates).
 */

/** Latest state of one lesson for this enrollment (domain model: LessonProgress). Completion never reverts. */
export const LessonProgressState = z.enum(['not_started', 'in_progress', 'completed']);
export type LessonProgressState = z.infer<typeof LessonProgressState>;

export const PlayerLesson = z.object({
  id: z.string(),
  title: z.string(),
  type: LessonType,
  /** Required lessons count towards course progress and completion (D-016). */
  required: z.boolean(),
  durationMinutes: z.number().int().min(0).max(600),
  /** Frozen with the version (D-041, Proposed until decided). */
  completionRule: LessonCompletionRule,
  progress: LessonProgressState,
});
export type PlayerLesson = z.infer<typeof PlayerLesson>;

export const PlayerModule = z.object({
  id: z.string(),
  title: z.string(),
  lessons: z.array(PlayerLesson).min(1).max(100),
});
export type PlayerModule = z.infer<typeof PlayerModule>;

export const CoursePlayer = z.object({
  generatedAt: IsoInstant,
  /** Tenant default timezone: the due date and "today" are cut in it (D-054). */
  timeZone: z.string(),
  enrollment: z.object({
    id: z.string(),
    courseTitle: z.string(),
    courseVersion: z.number().int().positive(),
    status: EnrollmentDisplayStatus,
    dueOn: IsoDate.nullable(),
    progressPercent: ProgressPercent,
    requiredLessons: Count,
    requiredCompleted: Count,
  }),
  /** Where opening the course lands: see `resumeLessonId`. */
  resumeLessonId: z.string(),
  modules: z.array(PlayerModule).min(1).max(50),
});
export type CoursePlayer = z.infer<typeof CoursePlayer>;

/** What the player area shows for one lesson. One shape per lesson type. */
export const LessonContent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), paragraphs: z.array(z.string()).min(1) }),
  z.object({
    type: z.literal('video'),
    /** VideoProvider adapter (D-006); `mock` has no media. */
    provider: z.enum(['mock']),
    durationSeconds: z.number().int().positive(),
    /** Saved resume position (server-side, so it follows the learner across devices). */
    positionSeconds: z.number().int().nonnegative(),
    /** Furthest point watched, as an integer percent; ≥ 90 completes the lesson (D-041). */
    percentWatched: ProgressPercent,
    hasCaptions: z.boolean(),
  }),
  z.object({
    type: z.literal('document'),
    fileName: z.string(),
    pageCount: z.number().int().positive(),
    sizeBytes: z.number().int().positive(),
    acknowledgedAt: IsoInstant.nullable(),
  }),
  z.object({
    type: z.literal('link'),
    /** External resources are https only. */
    url: z.url({ protocol: /^https$/ }),
    label: z.string(),
  }),
  z.object({
    type: z.literal('assessment'),
    assessmentTitle: z.string(),
    questionCount: z.number().int().min(1),
    passMarkPercent: z.number().int().min(1).max(100),
  }),
]);
export type LessonContent = z.infer<typeof LessonContent>;

export const LessonView = z.object({
  lessonId: z.string(),
  summary: z.string(),
  completedAt: IsoInstant.nullable(),
  content: LessonContent,
});
export type LessonView = z.infer<typeof LessonView>;

type ProgressInput = Pick<PlayerLesson, 'required' | 'progress'>;

/**
 * Course progress (D-016, Proposed): required lessons completed ÷ required lessons, rounded down, so 100% means every
 * required lesson is done. Optional lessons never move it. The dashboard and the player both use this.
 */
export function courseProgress(lessons: readonly ProgressInput[]) {
  const required = lessons.filter((l) => l.required);
  const completed = required.filter((l) => l.progress === 'completed').length;
  return {
    requiredLessons: required.length,
    requiredCompleted: completed,
    percent: required.length === 0 ? 0 : Math.floor((completed * 100) / required.length),
  };
}

/**
 * Where "Continue" lands (Proposed): the first lesson in course order that was opened but not completed, else the
 * first one not completed, else the first lesson (a finished course opens for review).
 */
export function resumeLesson<L extends Pick<PlayerLesson, 'progress'>>(
  modules: readonly { lessons: readonly L[] }[],
): L {
  const lessons = modules.flatMap((m) => m.lessons);
  const first = lessons[0];
  if (!first) throw new Error('A published course version has at least one lesson');
  return (
    lessons.find((l) => l.progress === 'in_progress') ??
    lessons.find((l) => l.progress !== 'completed') ??
    first
  );
}
