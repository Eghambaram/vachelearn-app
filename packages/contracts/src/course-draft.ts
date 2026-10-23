import { z } from 'zod';
import { CourseLevel, DeliveryMode } from './courses';

/*
 * A course's draft version (domain model: CourseVersion in `draft`). Published versions are immutable; editing a
 * published course works on its draft, and publishing creates the next version number. Phase 1 (D-067): the builder
 * edits this locally and nothing is persisted; Phase 3 adds GET/PUT /api/v1/courses/:id/draft with optimistic
 * concurrency (`version`) and POST …/draft/publish, which runs `publishIssues` on the server.
 */

/** Lesson types agreed for the MVP (spec §6). No SCORM/xAPI (D-012). */
export const LessonType = z.enum(['text', 'video', 'document', 'link', 'assessment']);
export type LessonType = z.infer<typeof LessonType>;

/**
 * How each lesson type is completed (D-041, Proposed until decided): shown in the builder so authors know what
 * learners must do. The server decides completion; the client never marks a lesson complete by itself.
 */
export const LessonCompletionRule = z.enum(['manual', 'watched_90', 'acknowledged', 'passed']);
export type LessonCompletionRule = z.infer<typeof LessonCompletionRule>;

export const LESSON_COMPLETION_RULE: Record<LessonType, LessonCompletionRule> = {
  text: 'manual',
  link: 'manual',
  video: 'watched_90',
  document: 'acknowledged',
  assessment: 'passed',
};

/** Course visibility (D-021 pending: no public option until the public catalogue is decided). */
export const CourseVisibility = z.enum(['assigned_only', 'catalog']);
export type CourseVisibility = z.infer<typeof CourseVisibility>;

export const DraftLesson = z.object({
  id: z.string(),
  title: z.string().max(120),
  type: LessonType,
  /** Required lessons count towards completion (D-016). */
  required: z.boolean(),
  durationMinutes: z.number().int().min(0).max(600),
});
export type DraftLesson = z.infer<typeof DraftLesson>;

export const DraftModule = z.object({
  id: z.string(),
  title: z.string().max(120),
  lessons: z.array(DraftLesson).max(100),
});
export type DraftModule = z.infer<typeof DraftModule>;

/** An assessment that already exists in the tenant (the assessment builder arrives in Phase 4.4). */
export const AssessmentSummary = z.object({
  id: z.string(),
  title: z.string(),
  questionCount: z.number().int().min(1),
  passMarkPercent: z.number().int().min(1).max(100),
});
export type AssessmentSummary = z.infer<typeof AssessmentSummary>;

export const CourseDraft = z.object({
  courseId: z.string(),
  /** Version number of the current published version, or null if never published. */
  publishedVersion: z.number().int().positive().nullable(),
  basics: z.object({
    title: z.string().max(120),
    summary: z.string().max(300),
    description: z.string().max(5000),
    categoryId: z.string().nullable(),
    level: CourseLevel,
    deliveryMode: DeliveryMode,
    /** BCP 47 tag; English only at launch (D-028). */
    language: z.string().max(35),
    objectives: z.array(z.string().max(200)).max(20),
    audience: z.string().max(500),
    prerequisites: z.string().max(500),
  }),
  modules: z.array(DraftModule).max(50),
  assessment: z.object({
    /** The final assessment, if the course has one. */
    assessmentId: z.string().nullable(),
  }),
  settings: z.object({
    visibility: CourseVisibility,
    /** D-046 (default off). */
    selfEnrollment: z.boolean(),
    /** D-016: all required lessons, plus passing the assessment when this is set. */
    requirePassingAssessment: z.boolean(),
  }),
  /** Optimistic-concurrency token for saving the draft (Phase 3). */
  version: z.number().int().nonnegative(),
});
export type CourseDraft = z.infer<typeof CourseDraft>;

export type PublishStep = 'basics' | 'content' | 'assessment' | 'settings';
export type PublishIssue = { step: PublishStep; code: string };

/**
 * Everything that blocks publishing (domain model: "metadata valid, ≥1 valid lesson, visibility + completion policy
 * set"). Pure and shared: the builder shows it as a checklist; the API refuses to publish while it is non-empty.
 */
export function publishIssues(draft: CourseDraft): PublishIssue[] {
  const issues: PublishIssue[] = [];
  const { basics, modules, assessment, settings } = draft;
  if (basics.title.trim().length < 3) issues.push({ step: 'basics', code: 'title_required' });
  if (basics.summary.trim().length === 0) issues.push({ step: 'basics', code: 'summary_required' });
  if (basics.categoryId === null) issues.push({ step: 'basics', code: 'category_required' });
  if (basics.objectives.filter((o) => o.trim()).length === 0) {
    issues.push({ step: 'basics', code: 'objective_required' });
  }
  const lessons = modules.flatMap((m) => m.lessons);
  if (lessons.length === 0) issues.push({ step: 'content', code: 'lesson_required' });
  if (modules.some((m) => m.lessons.length === 0))
    issues.push({ step: 'content', code: 'empty_module' });
  if (modules.some((m) => !m.title.trim()) || lessons.some((l) => !l.title.trim())) {
    issues.push({ step: 'content', code: 'untitled_item' });
  }
  if (lessons.length > 0 && !lessons.some((l) => l.required)) {
    issues.push({ step: 'content', code: 'required_lesson_needed' });
  }
  if (settings.requirePassingAssessment && assessment.assessmentId === null) {
    issues.push({ step: 'assessment', code: 'assessment_required' });
  }
  return issues;
}

/** The version number publishing this draft would create. */
export function nextVersionNumber(draft: CourseDraft) {
  return (draft.publishedVersion ?? 0) + 1;
}
