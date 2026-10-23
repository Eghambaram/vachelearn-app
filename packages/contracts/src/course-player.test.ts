import { CoursePlayer, courseProgress, LessonContent, resumeLesson } from './course-player';

const lesson = (
  id: string,
  required: boolean,
  progress: 'not_started' | 'in_progress' | 'completed',
) => ({
  id,
  required,
  progress,
});

describe('courseProgress (D-016: required lessons only, rounded down)', () => {
  it('counts required lessons only; optional ones never move it', () => {
    expect(
      courseProgress([
        lesson('a', true, 'completed'),
        lesson('b', false, 'completed'),
        lesson('c', true, 'in_progress'),
        lesson('d', true, 'not_started'),
      ]),
    ).toEqual({ requiredLessons: 3, requiredCompleted: 1, percent: 33 });
  });

  it('rounds down, so 100% means every required lesson is done', () => {
    const lessons = [
      ...Array.from({ length: 199 }, (_, i) => lesson(`r${i}`, true, 'completed')),
      lesson('last', true, 'not_started'),
    ];
    expect(courseProgress(lessons).percent).toBe(99);
    expect(courseProgress([lesson('a', true, 'completed')]).percent).toBe(100);
  });

  it('is 0 with no required lessons (never divides by zero)', () => {
    expect(courseProgress([lesson('a', false, 'completed')])).toEqual({
      requiredLessons: 0,
      requiredCompleted: 0,
      percent: 0,
    });
  });
});

describe('resumeLesson', () => {
  it('prefers the first opened-but-unfinished lesson in course order', () => {
    const modules = [
      { lessons: [lesson('a', true, 'completed'), lesson('b', false, 'not_started')] },
      { lessons: [lesson('c', true, 'in_progress'), lesson('d', true, 'in_progress')] },
    ];
    expect(resumeLesson(modules).id).toBe('c');
  });

  it('falls back to the first lesson not completed, then to the first lesson', () => {
    expect(
      resumeLesson([
        { lessons: [lesson('a', true, 'completed'), lesson('b', true, 'not_started')] },
      ]).id,
    ).toBe('b');
    expect(
      resumeLesson([{ lessons: [lesson('a', true, 'completed'), lesson('b', true, 'completed')] }])
        .id,
    ).toBe('a');
  });

  it('refuses an empty course', () => {
    expect(() => resumeLesson([])).toThrow();
  });
});

describe('contracts', () => {
  it('external links must be https', () => {
    const link = { type: 'link', label: 'Reading' } as const;
    expect(LessonContent.safeParse({ ...link, url: 'https://example.com/a' }).success).toBe(true);
    expect(LessonContent.safeParse({ ...link, url: 'http://example.com/a' }).success).toBe(false);
    expect(LessonContent.safeParse({ ...link, url: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('a course outline has at least one module', () => {
    const result = CoursePlayer.safeParse({
      generatedAt: '2026-10-22T09:30:00.000Z',
      timeZone: 'Asia/Kolkata',
      enrollment: {
        id: 'e',
        courseTitle: 'T',
        courseVersion: 1,
        status: 'not_started',
        dueOn: null,
        progressPercent: 0,
        requiredLessons: 0,
        requiredCompleted: 0,
      },
      resumeLessonId: 'x',
      modules: [],
    });
    expect(result.success).toBe(false);
  });
});
