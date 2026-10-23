import {
  LESSON_COMPLETION_RULE,
  type EnrollmentLifecycle,
  type LessonContent,
  type LessonType,
  type PlayerLesson,
  type PlayerModule,
} from '@vachelearn/contracts';

/*
 * Phase 1 demo course outlines for the player (slice 1.5.5). Every demo course version has the same shape: 5 modules
 * × 5 lessons, one optional lesson per module, so 20 required lessons and the enrollment's progress lands on whole
 * lessons. Lesson progress is laid down in course order up to the enrollment's progress, so the dashboard (which
 * derives its figures from this outline) and the player agree by construction. Replaced by the API in Phase 4.
 */

const MODULES: readonly { title: string; lessons: readonly string[] }[] = [
  {
    title: 'Introduction',
    lessons: [
      'Welcome to the course',
      'Why this matters',
      'Your responsibilities',
      'Further reading',
      'Course objectives',
    ],
  },
  {
    title: 'Recognising hazards',
    lessons: [
      'What is a hazard?',
      'Types of hazards',
      'Spotting hazards on the floor',
      'Real-world examples',
      'Summary: hazards',
    ],
  },
  {
    title: 'Safe practice',
    lessons: [
      'Before you start',
      'The safe procedure',
      'Personal protective equipment',
      'Supplier guidance',
      'Summary: safe practice',
    ],
  },
  {
    title: 'On the floor',
    lessons: [
      'Reporting a hazard',
      'Working with others',
      'Shift handover',
      'Industry guidance',
      'Summary: on the floor',
    ],
  },
  {
    title: 'Emergencies',
    lessons: [
      'Raising the alarm',
      'Evacuation routes',
      'First response',
      'Emergency contacts',
      'Final check',
    ],
  },
];

const CORE_TYPES: readonly LessonType[] = ['video', 'text', 'document'];
/** The fourth lesson of every module is optional further reading. */
const OPTIONAL_INDEX = 3;

function lessonType(m: number, l: number, seed: number): LessonType {
  if (l === OPTIONAL_INDEX) return 'link';
  if (l === 4) return m === MODULES.length - 1 ? 'assessment' : 'text';
  return CORE_TYPES[(m + l + seed) % CORE_TYPES.length]!;
}

/**
 * The pinned version's outline with this enrollment's lesson progress. `targetPercent` is the enrollment's progress;
 * the lessons before that point are completed and, for a course in progress, the next one is opened.
 */
export function demoOutline({
  courseKey,
  seed,
  status,
  targetPercent,
}: {
  courseKey: string;
  seed: number;
  status: EnrollmentLifecycle;
  targetPercent: number;
}): PlayerModule[] {
  const modules = MODULES.map((module, m) => ({
    id: `${courseKey}-m${m + 1}`,
    title: module.title,
    lessons: module.lessons.map((title, l): PlayerLesson => {
      const type = lessonType(m, l, seed);
      return {
        id: `${courseKey}-m${m + 1}-l${l + 1}`,
        title,
        type,
        required: l !== OPTIONAL_INDEX,
        durationMinutes: 5 + ((m * 7 + l * 3 + seed) % 10),
        completionRule: LESSON_COMPLETION_RULE[type],
        progress: 'not_started',
      };
    }),
  }));
  const lessons = modules.flatMap((m) => m.lessons);
  const requiredTotal = lessons.filter((l) => l.required).length;
  const toComplete =
    status === 'completed' ? requiredTotal : Math.round((targetPercent * requiredTotal) / 100);
  let done = 0;
  let i = 0;
  for (; i < lessons.length && (done < toComplete || status === 'completed'); i++) {
    lessons[i]!.progress = 'completed';
    if (lessons[i]!.required) done++;
  }
  if (status === 'in_progress' && lessons[i]) lessons[i]!.progress = 'in_progress';
  return modules;
}

/** Player content for one lesson. Demo copy only; the real text, media and files come from the course version. */
export function demoLessonContent(lesson: PlayerLesson, seed: number): LessonContent {
  switch (lesson.type) {
    case 'text':
      return {
        type: 'text',
        paragraphs: [
          `Demo lesson text for “${lesson.title}”. Your organisation writes the real content when it builds the course.`,
          'In the real lesson this area holds the reading, with headings, lists and images the author adds.',
        ],
      };
    case 'video': {
      const durationSeconds = lesson.durationMinutes * 60 - 35;
      const percentWatched =
        lesson.progress === 'completed' ? 100 : lesson.progress === 'in_progress' ? 40 : 0;
      return {
        type: 'video',
        provider: 'mock',
        durationSeconds,
        positionSeconds:
          lesson.progress === 'in_progress'
            ? Math.floor((durationSeconds * percentWatched) / 100)
            : 0,
        percentWatched,
        hasCaptions: true,
      };
    }
    case 'document':
      return {
        type: 'document',
        fileName: `${lesson.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-demo.pdf`,
        pageCount: 4 + (seed % 8),
        sizeBytes: 180_000 + seed * 41_000,
        acknowledgedAt: null,
      };
    case 'link':
      return {
        type: 'link',
        url: 'https://example.com/',
        label: 'Example external resource (demo placeholder)',
      };
    case 'assessment':
      return {
        type: 'assessment',
        assessmentTitle: 'Final check (Demo)',
        questionCount: 10,
        passMarkPercent: 70,
      };
  }
}
