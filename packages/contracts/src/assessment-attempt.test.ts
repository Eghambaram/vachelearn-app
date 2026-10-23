import {
  answerIssues,
  AttemptQuestion,
  AttemptView,
  canStartAttempt,
  scoreAttempt,
  type GradableQuestion,
} from './assessment-attempt';

const q = (
  id: string,
  type: GradableQuestion['type'],
  correct: string[],
  points = 1,
): GradableQuestion => ({
  id,
  type,
  points,
  options: ['a', 'b', 'c', 'd'].map((o) => ({ id: `${id}${o}`, label: o })),
  correctOptionIds: correct.map((o) => `${id}${o}`),
});

describe('scoreAttempt (D-042 rounding, D-072 all-or-nothing)', () => {
  const questions = [
    q('q1', 'single', ['a']),
    q('q2', 'multiple', ['a', 'c'], 2),
    q('q3', 'true_false', ['b']),
  ];

  it('gives full points only for an exact answer; multiple select is all-or-nothing; unanswered is 0', () => {
    expect(scoreAttempt(questions, { q1: ['q1a'], q2: ['q2a', 'q2c'], q3: ['q3b'] }, 70)).toEqual({
      scorePoints: 4,
      possiblePoints: 4,
      scorePercentTenths: 1000,
      passed: true,
    });
    // One of two correct options, or a correct pair plus a wrong one, scores nothing for that question.
    expect(scoreAttempt(questions, { q1: ['q1a'], q2: ['q2a'] }, 70).scorePoints).toBe(1);
    expect(scoreAttempt(questions, { q2: ['q2a', 'q2c', 'q2d'] }, 70).scorePoints).toBe(0);
    expect(scoreAttempt(questions, {}, 70)).toMatchObject({
      scorePoints: 0,
      scorePercentTenths: 0,
    });
  });

  it('rounds half-up to one decimal without floats', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => q(`m${i}`, 'single', ['a']));
    const right = (n: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`m${i}`, [`m${i}a`]]));
    expect(scoreAttempt(many(3), right(2), 70).scorePercentTenths).toBe(667); // 66.666… → 66.7
    expect(scoreAttempt(many(3), right(1), 70).scorePercentTenths).toBe(333); // 33.333… → 33.3
    expect(scoreAttempt(many(8), right(1), 70).scorePercentTenths).toBe(125); // 12.5 exactly
    expect(scoreAttempt(many(16), right(1), 70).scorePercentTenths).toBe(63); // 6.25 → 6.3 (half-up)
  });

  it('passes at exactly the pass mark and fails just below it', () => {
    const many = Array.from({ length: 2000 }, (_, i) => q(`m${i}`, 'single', ['a']));
    const right = (n: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`m${i}`, [`m${i}a`]]));
    expect(scoreAttempt(many, right(1400), 70)).toMatchObject({
      scorePercentTenths: 700,
      passed: true,
    });
    // 69.95% rounds half-up to 70.0 and passes: the rounded score is what is compared (D-042).
    expect(scoreAttempt(many, right(1399), 70)).toMatchObject({
      scorePercentTenths: 700,
      passed: true,
    });
    expect(scoreAttempt(many, right(1398), 70)).toMatchObject({
      scorePercentTenths: 699,
      passed: false,
    });
  });
});

describe('answerIssues (server validates question and option ids)', () => {
  const questions = [q('q1', 'single', ['a']), q('q2', 'multiple', ['a', 'b'])];

  it('accepts valid answers and rejects foreign questions, foreign options and extra picks', () => {
    expect(answerIssues(questions, { q1: ['q1a'], q2: ['q2a', 'q2b'] })).toEqual([]);
    expect(answerIssues(questions, { qX: ['q1a'] })).toEqual([
      { questionId: 'qX', code: 'unknown_question' },
    ]);
    expect(answerIssues(questions, { q1: ['q2a'] })).toEqual([
      { questionId: 'q1', code: 'unknown_option' },
    ]);
    expect(answerIssues(questions, { q1: ['q1a', 'q1b'] })).toEqual([
      { questionId: 'q1', code: 'too_many_options' },
    ]);
  });
});

describe('canStartAttempt (D-073)', () => {
  it('only while not passed, nothing open, and attempts remain', () => {
    expect(canStartAttempt([], 3)).toBe(true);
    expect(canStartAttempt([{ status: 'failed' }], 3)).toBe(true);
    expect(canStartAttempt([{ status: 'failed' }, { status: 'passed' }], 3)).toBe(false);
    expect(canStartAttempt([{ status: 'in_progress' }], 3)).toBe(false);
    expect(
      canStartAttempt([{ status: 'failed' }, { status: 'failed' }, { status: 'failed' }], 3),
    ).toBe(false);
    expect(
      canStartAttempt([{ status: 'failed' }, { status: 'failed' }, { status: 'failed' }], null),
    ).toBe(true);
  });
});

describe('learner-facing questions never carry the answer key (D-023)', () => {
  it('a question with isCorrect on an option, or a correctOptionIds field, does not parse', () => {
    const question = { id: 'q', type: 'single', stem: 'S', points: 1 } as const;
    const options = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ];
    expect(AttemptQuestion.safeParse({ ...question, options }).success).toBe(true);
    expect(
      AttemptQuestion.safeParse({
        ...question,
        options: [{ ...options[0], isCorrect: true }, options[1]],
      }).success,
    ).toBe(false);
    expect(
      AttemptQuestion.safeParse({ ...question, options, correctOptionIds: ['a'] }).success,
    ).toBe(false);
  });
});

describe('AttemptView (D-055: no questions after the deadline)', () => {
  const view = (deadlineAt: string | null) => ({
    generatedAt: '2026-10-22T09:30:00.000Z',
    timeZone: 'Asia/Kolkata',
    enrollment: { id: 'e', courseTitle: 'C', lessonId: 'l' },
    assessment: {
      title: 'A',
      versionNumber: 1,
      passMarkPercent: 70,
      attemptLimit: 3,
      timeLimitSeconds: 900,
      questionCount: 1,
    },
    attempt: {
      id: 'a',
      attemptNumber: 1,
      status: 'in_progress',
      startedAt: '2026-10-22T09:20:00.000Z',
      submittedAt: null,
      scorePercentTenths: null,
      timedOut: false,
      deadlineAt,
    },
    history: [
      {
        id: 'a',
        attemptNumber: 1,
        status: 'in_progress',
        startedAt: '2026-10-22T09:20:00.000Z',
        submittedAt: null,
        scorePercentTenths: null,
        timedOut: false,
      },
    ],
    canRetake: false,
    body: {
      kind: 'taking',
      questions: [
        {
          id: 'q',
          type: 'true_false',
          stem: 'S',
          points: 1,
          options: [
            { id: 't', label: 'True' },
            { id: 'f', label: 'False' },
          ],
        },
      ],
      savedAnswers: {},
    },
  });

  it('serves questions only before the deadline (or with no time limit)', () => {
    expect(AttemptView.safeParse(view('2026-10-22T09:35:00.000Z')).success).toBe(true);
    expect(AttemptView.safeParse(view(null)).success).toBe(true);
    expect(AttemptView.safeParse(view('2026-10-22T09:30:00.000Z')).success).toBe(false);
  });
});
