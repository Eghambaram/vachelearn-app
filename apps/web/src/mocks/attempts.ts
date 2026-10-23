import {
  scoreAttempt,
  type AnswerMap,
  type AttemptStatus,
  type GradableQuestion,
} from '@vachelearn/contracts';
import type { DemoEnrollment } from './enrollments';
import { DAY } from './time';

/*
 * Phase 1 demo assessment attempts (slice 1.5.6). One assessment version — the "Final check" lesson of every demo
 * course — with its answer key, which stays here on the server side and is never sent to the learner (D-023).
 * Graded attempts are scored with the shared `scoreAttempt` (D-042, D-072), exactly as the API will score them.
 * Replaced by the API in Phase 4.4.
 */

export const DEMO_ASSESSMENT = {
  title: 'Final check (Demo)',
  versionNumber: 1,
  passMarkPercent: 70,
  attemptLimit: 3,
  timeLimitSeconds: 15 * 60,
} as const;

type Spec = [
  stem: string,
  type: GradableQuestion['type'],
  points: number,
  options: string[],
  correct: number[],
];

const SPECS: Spec[] = [
  [
    'What is the first step before operating a machine? (Demo)',
    'single',
    1,
    [
      'Increase the speed',
      'Check for visible hazards around the machine',
      'Start the machine immediately',
      'Ignore safety warnings',
    ],
    [1],
  ],
  [
    'Personal protective equipment replaces the need for machine guards. (Demo)',
    'true_false',
    1,
    ['True', 'False'],
    [1],
  ],
  [
    'Who may remove a lockout tag? (Demo)',
    'single',
    2,
    ['Any supervisor', 'The person who applied it', 'The next shift', 'Maintenance, on request'],
    [1],
  ],
  [
    'Which of these are physical hazards? (Demo)',
    'multiple',
    1,
    ['Noise', 'Moving machinery', 'Solvent fumes', 'Bacteria'],
    [0, 1],
  ],
  [
    'Where should you report a near miss? (Demo)',
    'single',
    1,
    [
      'Nowhere, if no one was hurt',
      'To your supervisor or the reporting system',
      'Only at the monthly meeting',
      'On social media',
    ],
    [1],
  ],
  [
    'You should use a lift to evacuate during a fire alarm. (Demo)',
    'true_false',
    1,
    ['True', 'False'],
    [1],
  ],
  [
    'What should you do first if you discover a fire? (Demo)',
    'single',
    2,
    ['Raise the alarm', 'Collect your belongings', 'Open all the windows', 'Finish your task'],
    [0],
  ],
  [
    'Which items belong in a shift handover? (Demo)',
    'multiple',
    1,
    ['Open hazards', 'Equipment faults', 'Lunch plans', 'Personal opinions'],
    [0, 1],
  ],
  [
    'How often should you inspect your PPE? (Demo)',
    'single',
    1,
    ['Before each use', 'Once a year', 'Only when it breaks', 'Never'],
    [0],
  ],
  [
    'Good housekeeping helps prevent slips and trips. (Demo)',
    'true_false',
    1,
    ['True', 'False'],
    [0],
  ],
];

/** The assessment version's questions with the answer key (server side only). */
export const DEMO_QUESTIONS: (GradableQuestion & { stem: string })[] = SPECS.map(
  ([stem, type, points, options, correct], i) => {
    const id = `demo-q${i + 1}`;
    return {
      id,
      type,
      points,
      stem,
      options: options.map((label, o) => ({ id: `${id}-o${o + 1}`, label })),
      correctOptionIds: correct.map((o) => `${id}-o${o + 1}`),
    };
  },
);

/** Answers: questions listed in `right` are answered correctly, those in `wrong` with the first wrong option. */
function answers(right: number[], wrong: number[] = []): AnswerMap {
  const map: AnswerMap = {};
  for (const n of right) map[`demo-q${n}`] = [...DEMO_QUESTIONS[n - 1]!.correctOptionIds];
  for (const n of wrong) {
    const q = DEMO_QUESTIONS[n - 1]!;
    map[q.id] = [q.options.find((o) => !q.correctOptionIds.includes(o.id))!.id];
  }
  return map;
}

type Plan =
  | { kind: 'in_progress'; startedMinutesAgo: number; answers: AnswerMap }
  | { kind: 'graded'; daysBeforeLastActivity: number; answers: AnswerMap; timedOut?: boolean };

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Attempts per enrollment, keyed by `${userId}:${row index}` in `mocks/enrollments.ts`. */
const PLANS: Record<string, Plan[]> = {
  // Fire Safety Refresher: an attempt left open past its deadline; the next read grades it as timed out (D-055).
  'demo-user:0': [{ kind: 'in_progress', startedMinutesAgo: 40, answers: answers([1, 2], [3]) }],
  // Hazard Identification: failed once, second attempt open now.
  'demo-user:2': [
    {
      kind: 'graded',
      daysBeforeLastActivity: 3,
      answers: answers([1, 2, 3, 4, 5, 6], [7, 8, 9, 10]),
    },
    { kind: 'in_progress', startedMinutesAgo: 3, answers: answers([1, 2], [3]) },
  ],
  // Forklift Operation Basics (overdue): ran out of time with four answers saved (D-055).
  'demo-user:1': [
    { kind: 'graded', daysBeforeLastActivity: 1, answers: answers([1, 2, 3, 4]), timedOut: true },
  ],
  // First Aid Essentials (completed, certificate): failed, then passed.
  'demo-user:6': [
    {
      kind: 'graded',
      daysBeforeLastActivity: 2,
      answers: answers([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]),
    },
    {
      kind: 'graded',
      daysBeforeLastActivity: 0,
      answers: answers(
        ALL.filter((n) => n !== 8),
        [8],
      ),
    },
  ],
  // Working at Height (completed, no certificate): passed first time.
  'demo-user:7': [
    {
      kind: 'graded',
      daysBeforeLastActivity: 0,
      answers: answers(
        ALL.filter((n) => n !== 4 && n !== 10),
        [4, 10],
      ),
    },
  ],
  // Another learner: never visible to Demo User.
  // Confined Space Entry (cancelled enrollment): its attempts are never reachable.
  'demo-user:9': [{ kind: 'graded', daysBeforeLastActivity: 1, answers: answers(ALL) }],
  'demo-other-learner:0': [{ kind: 'in_progress', startedMinutesAgo: 5, answers: answers([1]) }],
};

export type DemoAttempt = {
  id: string;
  enrollmentId: string;
  /** The course lesson that embeds the assessment. */
  lessonId: string;
  attemptNumber: number;
  status: AttemptStatus;
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
  timedOut: boolean;
  answers: AnswerMap;
};

const MINUTE = 60_000;

export function demoAttempts(enrollment: DemoEnrollment, now: number): DemoAttempt[] {
  const plans = PLANS[`${enrollment.userId}:${enrollment.seed}`] ?? [];
  const anchor = enrollment.lastActivityAt ? Date.parse(enrollment.lastActivityAt) : now;
  const lessonId = enrollment.modules
    .flatMap((m) => m.lessons)
    .find((l) => l.type === 'assessment')?.id;
  if (!lessonId) return [];
  return plans.map((plan, i) => {
    const started =
      plan.kind === 'in_progress'
        ? now - plan.startedMinutesAgo * MINUTE
        : anchor - plan.daysBeforeLastActivity * DAY - 20 * MINUTE;
    const deadline = started + DEMO_ASSESSMENT.timeLimitSeconds * 1000;
    const base = {
      id: `${enrollment.id}-att-${i + 1}`,
      enrollmentId: enrollment.id,
      lessonId,
      attemptNumber: i + 1,
      startedAt: new Date(started).toISOString(),
      deadlineAt: new Date(deadline).toISOString(),
      answers: plan.answers,
    };
    // D-055 (Proposed): an open attempt past its deadline is graded from the answers saved before it, as the server
    // does lazily on the next read.
    const expired = plan.kind === 'in_progress' && deadline <= now;
    if (plan.kind === 'in_progress' && !expired) {
      return { ...base, status: 'in_progress', submittedAt: null, timedOut: false };
    }
    const timedOut = expired || (plan.kind === 'graded' && plan.timedOut === true);
    const { passed } = scoreAttempt(DEMO_QUESTIONS, plan.answers, DEMO_ASSESSMENT.passMarkPercent);
    return {
      ...base,
      status: passed ? 'passed' : 'failed',
      submittedAt: new Date(timedOut ? deadline : started + 11 * MINUTE).toISOString(),
      timedOut,
    };
  });
}
