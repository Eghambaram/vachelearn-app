import { z } from 'zod';
import { IsoInstant } from './common';

/*
 * Assessment attempts, learner side (UI spec #42; domain model: AssessmentVersion, Attempt, Answer).
 *   GET  /api/v1/me/attempts/:attemptId                 → AttemptView (own attempts only; any other id is a 404)
 *   POST /api/v1/me/enrollments/:id/assessments/:aid/attempts, PUT …/attempts/:id/answers/:qid, POST …/submit (Phase 4)
 * The learner-facing shapes never contain the answer key (D-023): questions are strict objects, so a stray
 * `isCorrect` fails to parse instead of reaching the browser. Scores, pass/fail, the deadline and retake eligibility
 * are computed by the server with the shared functions below.
 */

export const QuestionType = z.enum(['single', 'multiple', 'true_false']);
export type QuestionType = z.infer<typeof QuestionType>;

export const AttemptStatus = z.enum(['in_progress', 'submitted', 'passed', 'failed']);
export type AttemptStatus = z.infer<typeof AttemptStatus>;

/** Score as integer tenths of a percent: 925 = 92.5% (D-042: one decimal, never a float on the wire). */
export const PercentTenths = z.number().int().min(0).max(1000);

export const AttemptQuestion = z.strictObject({
  id: z.string(),
  type: QuestionType,
  stem: z.string().max(1000),
  points: z.number().int().min(1).max(100),
  options: z
    .array(z.strictObject({ id: z.string(), label: z.string().max(500) }))
    .min(2)
    .max(10),
});
export type AttemptQuestion = z.infer<typeof AttemptQuestion>;

/** Selected option ids per question id. */
export const AnswerMap = z.record(z.string(), z.array(z.string()).max(10));
export type AnswerMap = z.infer<typeof AnswerMap>;

export const AttemptScore = z.object({
  scorePoints: z.number().int().nonnegative(),
  possiblePoints: z.number().int().positive(),
  scorePercentTenths: PercentTenths,
  passed: z.boolean(),
});
export type AttemptScore = z.infer<typeof AttemptScore>;

/** One attempt in the learner's history for this assessment version. A retake never overwrites an earlier one. */
export const AttemptSummary = z.object({
  id: z.string(),
  attemptNumber: z.number().int().positive(),
  status: AttemptStatus,
  startedAt: IsoInstant,
  submittedAt: IsoInstant.nullable(),
  scorePercentTenths: PercentTenths.nullable(),
  /** D-055: the deadline passed and the answers saved before it were graded. */
  timedOut: z.boolean(),
});
export type AttemptSummary = z.infer<typeof AttemptSummary>;

export const AttemptView = z
  .object({
    generatedAt: IsoInstant,
    timeZone: z.string(),
    enrollment: z.object({ id: z.string(), courseTitle: z.string(), lessonId: z.string() }),
    assessment: z.object({
      title: z.string(),
      versionNumber: z.number().int().positive(),
      passMarkPercent: z.number().int().min(1).max(100),
      /** Null = unlimited. */
      attemptLimit: z.number().int().positive().nullable(),
      timeLimitSeconds: z.number().int().positive().nullable(),
      questionCount: z.number().int().min(1),
    }),
    attempt: AttemptSummary.extend({ deadlineAt: IsoInstant.nullable() }),
    /** Every attempt of this assessment version by this learner, oldest first (includes this one). */
    history: z.array(AttemptSummary).min(1),
    /** D-073, computed by the server with `canStartAttempt`. */
    canRetake: z.boolean(),
    body: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('taking'),
        questions: z.array(AttemptQuestion).min(1).max(200),
        /** Answers the server already holds for this attempt (resume on any device). */
        savedAnswers: AnswerMap,
      }),
      /** D-023: the learner sees the score and outcome only — no questions, no per-question correctness. */
      z.object({ kind: z.literal('result'), score: AttemptScore }),
    ]),
  })
  // D-055: the server finalizes an open attempt whose deadline has passed before answering, so questions are never
  // served after the deadline and an expired attempt cannot stay open (and block retakes).
  .refine(
    (v) =>
      v.body.kind !== 'taking' ||
      v.attempt.deadlineAt === null ||
      Date.parse(v.attempt.deadlineAt) > Date.parse(v.generatedAt),
    { message: 'An attempt past its deadline is returned as a result', path: ['body'] },
  );
export type AttemptView = z.infer<typeof AttemptView>;

/** Server-side question with its answer key. Never part of a learner-facing response. */
export type GradableQuestion = Pick<AttemptQuestion, 'id' | 'type' | 'points' | 'options'> & {
  correctOptionIds: readonly string[];
};

export type AnswerIssue = {
  questionId: string;
  code: 'unknown_question' | 'unknown_option' | 'too_many_options';
};

/** Server validation of submitted answers: only this version's questions and options, one option unless multiple. */
export function answerIssues(
  questions: readonly Pick<AttemptQuestion, 'id' | 'type' | 'options'>[],
  answers: AnswerMap,
): AnswerIssue[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const issues: AnswerIssue[] = [];
  for (const [questionId, selected] of Object.entries(answers)) {
    const question = byId.get(questionId);
    if (!question) {
      issues.push({ questionId, code: 'unknown_question' });
      continue;
    }
    const optionIds = new Set(question.options.map((o) => o.id));
    if (selected.some((id) => !optionIds.has(id)))
      issues.push({ questionId, code: 'unknown_option' });
    else if (question.type !== 'multiple' && selected.length > 1) {
      issues.push({ questionId, code: 'too_many_options' });
    }
  }
  return issues;
}

/**
 * D-042 + D-072: points for each question answered exactly right (multiple select is all-or-nothing; unanswered = 0);
 * percent = earned ÷ possible × 100 rounded half-up to one decimal, in integer arithmetic; pass when ≥ pass mark.
 * Callers validate answers with `answerIssues` first.
 */
export function scoreAttempt(
  questions: readonly GradableQuestion[],
  answers: AnswerMap,
  passMarkPercent: number,
): AttemptScore {
  const possiblePoints = questions.reduce((sum, q) => sum + q.points, 0);
  if (possiblePoints <= 0) throw new Error('An assessment version has at least one point');
  const scorePoints = questions.reduce((sum, q) => {
    const selected = new Set(answers[q.id] ?? []);
    const correct = new Set(q.correctOptionIds);
    const exact = selected.size === correct.size && [...correct].every((id) => selected.has(id));
    return sum + (exact ? q.points : 0);
  }, 0);
  // Half-up rounding of earned × 1000 ÷ possible without floats.
  const scorePercentTenths = Math.floor(
    (scorePoints * 2000 + possiblePoints) / (2 * possiblePoints),
  );
  return {
    scorePoints,
    possiblePoints,
    scorePercentTenths,
    passed: scorePercentTenths >= passMarkPercent * 10,
  };
}

/*
 * Phase 4 obligations these pure checks do not cover (tenant-isolation review, 2026-10-23):
 * - `canStartAttempt` is advisory. Start enforces the limit and "one open attempt" in the database: unique
 *   (tenant_id, enrollment_id, assessment_version_id, attempt_number), a partial unique index on the same columns
 *   WHERE status = 'in_progress', the next number taken under a row lock on the enrollment, and an Idempotency-Key.
 *   It also requires an active (not cancelled or completed-by-migration) enrollment on the pinned version.
 * - Answer writes and submit are refused with 409 ATTEMPT_CLOSED unless the attempt is `in_progress` and now is
 *   before `deadlineAt` (+ any grace D-055 settles); each saved answer records `savedAt`, and an expired attempt is
 *   graded from the answers saved before the deadline only.
 * - Attempt ids are UUID v7 (the contract tightens to `z.uuid()` with the API); 404 for anyone else's stays the
 *   control.
 */

/** D-073: a new attempt only while the learner has not passed and attempts remain (null limit = unlimited). */
export function canStartAttempt(
  history: readonly Pick<AttemptSummary, 'status'>[],
  attemptLimit: number | null,
) {
  if (history.some((a) => a.status === 'passed')) return false;
  if (history.some((a) => a.status === 'in_progress' || a.status === 'submitted')) return false;
  return attemptLimit === null || history.length < attemptLimit;
}
