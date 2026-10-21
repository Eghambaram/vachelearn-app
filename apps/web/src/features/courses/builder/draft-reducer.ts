import type { CourseDraft, DraftLesson, LessonType } from '@vachelearn/contracts';

/*
 * Local edits to a course draft (D-067: nothing is persisted in Phase 1). Pure, so every edit and reorder is unit
 * tested; Phase 3 sends the resulting draft to the API, which validates it again.
 */

export type DraftAction =
  | { type: 'basics'; patch: Partial<CourseDraft['basics']> }
  | { type: 'addModule'; id: string; title: string }
  | { type: 'renameModule'; moduleId: string; title: string }
  | { type: 'removeModule'; moduleId: string }
  | { type: 'moveModule'; moduleId: string; delta: -1 | 1 }
  | { type: 'addLesson'; moduleId: string; id: string; title: string; lessonType: LessonType }
  | {
      type: 'updateLesson';
      moduleId: string;
      lessonId: string;
      patch: Partial<Omit<DraftLesson, 'id'>>;
    }
  | { type: 'removeLesson'; moduleId: string; lessonId: string }
  | { type: 'moveLesson'; moduleId: string; lessonId: string; delta: -1 | 1 }
  | { type: 'assessment'; assessmentId: string | null }
  | { type: 'settings'; patch: Partial<CourseDraft['settings']> };

/** Moves the item at `index` by `delta`, or returns the same array when it would leave the list. */
export function move<T>(items: readonly T[], index: number, delta: -1 | 1): readonly T[] {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function draftReducer(draft: CourseDraft, action: DraftAction): CourseDraft {
  const mapModule = (
    moduleId: string,
    f: (m: CourseDraft['modules'][number]) => CourseDraft['modules'][number],
  ) => ({
    ...draft,
    modules: draft.modules.map((m) => (m.id === moduleId ? f(m) : m)),
  });
  switch (action.type) {
    case 'basics':
      return { ...draft, basics: { ...draft.basics, ...action.patch } };
    case 'addModule':
      return {
        ...draft,
        modules: [...draft.modules, { id: action.id, title: action.title, lessons: [] }],
      };
    case 'renameModule':
      return mapModule(action.moduleId, (m) => ({ ...m, title: action.title }));
    case 'removeModule':
      return { ...draft, modules: draft.modules.filter((m) => m.id !== action.moduleId) };
    case 'moveModule': {
      const index = draft.modules.findIndex((m) => m.id === action.moduleId);
      return { ...draft, modules: [...move(draft.modules, index, action.delta)] };
    }
    case 'addLesson':
      return mapModule(action.moduleId, (m) => ({
        ...m,
        lessons: [
          ...m.lessons,
          {
            id: action.id,
            title: action.title,
            type: action.lessonType,
            required: true,
            durationMinutes: 5,
          },
        ],
      }));
    case 'updateLesson':
      return mapModule(action.moduleId, (m) => ({
        ...m,
        lessons: m.lessons.map((l) => (l.id === action.lessonId ? { ...l, ...action.patch } : l)),
      }));
    case 'removeLesson':
      return mapModule(action.moduleId, (m) => ({
        ...m,
        lessons: m.lessons.filter((l) => l.id !== action.lessonId),
      }));
    case 'moveLesson':
      return mapModule(action.moduleId, (m) => {
        const index = m.lessons.findIndex((l) => l.id === action.lessonId);
        return { ...m, lessons: [...move(m.lessons, index, action.delta)] };
      });
    case 'assessment':
      return { ...draft, assessment: { assessmentId: action.assessmentId } };
    case 'settings':
      return { ...draft, settings: { ...draft.settings, ...action.patch } };
  }
}
