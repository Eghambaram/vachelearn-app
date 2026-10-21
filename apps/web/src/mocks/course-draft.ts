import type {
  AssessmentSummary,
  CourseDraft,
  CourseListItem,
  LessonType,
} from '@vachelearn/contracts';

/*
 * Phase 1 demo drafts for the course builder (D-067). Built deterministically from the demo course list so the list
 * and the builder agree on title, category, level, module and lesson counts. Replaced by the API in Phase 3.
 */

const TYPES: readonly LessonType[] = ['video', 'text', 'document', 'link', 'video', 'assessment'];

export function demoAssessments(tenantId: string): AssessmentSummary[] {
  return [
    {
      id: `${tenantId}-assess-1`,
      title: 'Safety Knowledge Check (Demo)',
      questionCount: 10,
      passMarkPercent: 70,
    },
    {
      id: `${tenantId}-assess-2`,
      title: 'Equipment Handling Quiz (Demo)',
      questionCount: 15,
      passMarkPercent: 80,
    },
    {
      id: `${tenantId}-assess-3`,
      title: 'Supervisor Readiness Test (Demo)',
      questionCount: 12,
      passMarkPercent: 75,
    },
  ];
}

export function demoDraftFor(course: CourseListItem, tenantId: string): CourseDraft {
  const n = Number(course.id.slice(-3));
  const perModule = Math.max(1, Math.round(course.lessonCount / course.moduleCount));
  const topic = course.title.replace(/ \(Demo\)$/, '');
  return {
    courseId: course.id,
    publishedVersion: course.publishedVersion,
    basics: {
      title: course.title,
      summary: `Demo summary: the essentials of ${topic.toLowerCase()} for frontline teams.`,
      description: 'Demo description. Real course content is written by your organisation.',
      categoryId: course.category?.id ?? null,
      level: course.level,
      deliveryMode: course.deliveryMode,
      language: 'en',
      objectives: [
        'Explain the main hazards (demo objective)',
        'Apply the safe procedure (demo objective)',
      ],
      audience: 'Production operators (demo)',
      prerequisites: '',
    },
    modules: Array.from({ length: course.moduleCount }, (_, m) => ({
      id: `${course.id}-m${m + 1}`,
      title: `Module ${m + 1}: ${['Introduction', 'Core practice', 'On the floor', 'Emergencies', 'Review', 'Wrap-up'][m % 6]} (Demo)`,
      lessons: Array.from({ length: perModule }, (_, l) => ({
        id: `${course.id}-m${m + 1}-l${l + 1}`,
        title: `Lesson ${m + 1}.${l + 1} (Demo)`,
        type: TYPES[(m + l + n) % TYPES.length]!,
        required: (l + n) % 4 !== 3,
        durationMinutes: 5 + ((m * 7 + l * 3 + n) % 20),
      })),
    })),
    assessment: { assessmentId: n % 3 === 0 ? null : `${tenantId}-assess-${(n % 3) + 1}` },
    settings: {
      visibility: n % 2 === 0 ? 'catalog' : 'assigned_only',
      selfEnrollment: false,
      requirePassingAssessment: n % 3 !== 0,
    },
    version: 0,
  };
}

/** A brand-new course: nothing filled in, so the publish checklist shows what is needed. */
export function emptyDraft(): CourseDraft {
  return {
    courseId: 'new',
    publishedVersion: null,
    basics: {
      title: '',
      summary: '',
      description: '',
      categoryId: null,
      level: 'beginner',
      deliveryMode: 'online',
      language: 'en',
      objectives: [],
      audience: '',
      prerequisites: '',
    },
    modules: [],
    assessment: { assessmentId: null },
    settings: {
      visibility: 'assigned_only',
      selfEnrollment: false,
      requirePassingAssessment: false,
    },
    version: 0,
  };
}
