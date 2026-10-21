import type { CourseDraft } from '@vachelearn/contracts';
import { draftReducer, move } from './draft-reducer';

const base: CourseDraft = {
  courseId: 'c1',
  publishedVersion: 1,
  basics: {
    title: 'T',
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
  modules: [
    {
      id: 'm1',
      title: 'One',
      lessons: [
        { id: 'a', title: 'A', type: 'text', required: true, durationMinutes: 5 },
        { id: 'b', title: 'B', type: 'video', required: true, durationMinutes: 5 },
      ],
    },
    { id: 'm2', title: 'Two', lessons: [] },
  ],
  assessment: { assessmentId: null },
  settings: { visibility: 'assigned_only', selfEnrollment: false, requirePassingAssessment: false },
  version: 0,
};

describe('move', () => {
  it('swaps with the neighbour and refuses to leave the list', () => {
    expect(move(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(move(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    const list = ['a', 'b'];
    expect(move(list, 0, -1)).toBe(list);
    expect(move(list, 1, 1)).toBe(list);
    expect(move(list, -1, 1)).toBe(list);
  });
});

describe('draftReducer', () => {
  it('reorders modules and lessons without touching the input', () => {
    const moved = draftReducer(base, { type: 'moveModule', moduleId: 'm2', delta: -1 });
    expect(moved.modules.map((m) => m.id)).toEqual(['m2', 'm1']);
    expect(base.modules.map((m) => m.id)).toEqual(['m1', 'm2']);
    const lessons = draftReducer(base, {
      type: 'moveLesson',
      moduleId: 'm1',
      lessonId: 'a',
      delta: 1,
    });
    expect(lessons.modules[0]!.lessons.map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('adds, edits and removes modules and lessons', () => {
    let d = draftReducer(base, { type: 'addModule', id: 'm3', title: 'Three' });
    d = draftReducer(d, {
      type: 'addLesson',
      moduleId: 'm3',
      id: 'c',
      title: 'C',
      lessonType: 'document',
    });
    d = draftReducer(d, {
      type: 'updateLesson',
      moduleId: 'm3',
      lessonId: 'c',
      patch: { required: false },
    });
    d = draftReducer(d, { type: 'renameModule', moduleId: 'm3', title: 'Third' });
    expect(d.modules[2]).toEqual({
      id: 'm3',
      title: 'Third',
      lessons: [{ id: 'c', title: 'C', type: 'document', required: false, durationMinutes: 5 }],
    });
    d = draftReducer(d, { type: 'removeLesson', moduleId: 'm1', lessonId: 'a' });
    d = draftReducer(d, { type: 'removeModule', moduleId: 'm2' });
    expect(d.modules.map((m) => [m.id, m.lessons.map((l) => l.id)])).toEqual([
      ['m1', ['b']],
      ['m3', ['c']],
    ]);
  });

  it('patches basics, assessment and settings', () => {
    let d = draftReducer(base, { type: 'basics', patch: { title: 'New', categoryId: 'cat' } });
    d = draftReducer(d, { type: 'assessment', assessmentId: 'x' });
    d = draftReducer(d, { type: 'settings', patch: { requirePassingAssessment: true } });
    expect(d.basics).toMatchObject({ title: 'New', categoryId: 'cat', level: 'beginner' });
    expect(d.assessment.assessmentId).toBe('x');
    expect(d.settings).toMatchObject({
      requirePassingAssessment: true,
      visibility: 'assigned_only',
    });
  });
});
