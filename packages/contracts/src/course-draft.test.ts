import {
  CourseDraft,
  nextVersionNumber,
  publishIssues,
  type CourseDraft as Draft,
} from './course-draft';

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    courseId: 'c1',
    publishedVersion: 2,
    basics: {
      title: 'Fire Safety Refresher',
      summary: 'Annual refresher.',
      description: '',
      categoryId: 'cat-1',
      level: 'beginner',
      deliveryMode: 'online',
      language: 'en',
      objectives: ['Use an extinguisher'],
      audience: '',
      prerequisites: '',
    },
    modules: [
      {
        id: 'm1',
        title: 'Basics',
        lessons: [
          { id: 'l1', title: 'Fire triangle', type: 'video', required: true, durationMinutes: 5 },
        ],
      },
    ],
    assessment: { assessmentId: null },
    settings: {
      visibility: 'assigned_only',
      selfEnrollment: false,
      requirePassingAssessment: false,
    },
    version: 0,
    ...overrides,
  };
}

describe('publishIssues (shared publish rule)', () => {
  it('passes a complete draft', () => {
    expect(publishIssues(draft())).toEqual([]);
    expect(CourseDraft.parse(draft())).toEqual(draft());
  });

  it('blocks missing metadata', () => {
    const d = draft();
    d.basics = { ...d.basics, title: 'Hi', summary: ' ', categoryId: null, objectives: [' '] };
    expect(publishIssues(d).map((i) => i.code)).toEqual([
      'title_required',
      'summary_required',
      'category_required',
      'objective_required',
    ]);
  });

  it('needs at least one lesson, no empty or untitled modules, and a required lesson', () => {
    expect(publishIssues(draft({ modules: [] })).map((i) => i.code)).toEqual(['lesson_required']);
    const issues = publishIssues(
      draft({
        modules: [
          {
            id: 'm1',
            title: ' ',
            lessons: [{ id: 'l1', title: 'x', type: 'text', required: false, durationMinutes: 1 }],
          },
          { id: 'm2', title: 'Empty', lessons: [] },
        ],
      }),
    ).map((i) => i.code);
    expect(issues).toEqual(['empty_module', 'untitled_item', 'required_lesson_needed']);
  });

  it('requires an assessment when passing one is part of completion (D-016)', () => {
    const d = draft({
      settings: { visibility: 'catalog', selfEnrollment: false, requirePassingAssessment: true },
    });
    expect(publishIssues(d)).toEqual([{ step: 'assessment', code: 'assessment_required' }]);
    expect(publishIssues({ ...d, assessment: { assessmentId: 'a1' } })).toEqual([]);
  });
});

describe('nextVersionNumber', () => {
  it('is the published version plus one, or 1 for a never-published course', () => {
    expect(nextVersionNumber(draft())).toBe(3);
    expect(nextVersionNumber(draft({ publishedVersion: null }))).toBe(1);
  });
});
