import { z } from 'zod';
import { AssetKind, AssetStatus } from './assets';
import { PlainLabel, RowVersion } from './course-admin';
import { LessonCompletionRule, LessonType } from './course-draft';

/*
 * A course draft's outline: modules and lessons (Slice 3.5; spec §6; D-041, D-136–D-139). Read by every course reader
 * (D-127) under /api/v1/courses/:id/draft/…; changed only by `course.update` holders (Tenant Admin). Every change names
 * the draft `version` it read — the same token the basics form uses (D-137) — and answers with the whole outline and
 * the new token; a stale token → 409 `CONFLICT`. Lesson types, completion rules and content shapes: D-136, D-041.
 */

export const CONTENT_LIMITS = {
  modules: 50,
  lessonsPerModule: 100,
  lessonsPerVersion: 500,
  textChars: 20_000,
  urlChars: 2_000,
} as const;

export const ContentTitle = PlainLabel(1, 120, { joiners: true });

/**
 * D-136: plain text with simple formatting (paragraphs, `## ` headings, `- ` lists); never HTML — it is shown as text.
 * Line endings become `\n`; tabs and new lines are the only control characters kept; bidi overrides and other
 * invisible characters are refused (Indic joiners allowed). Empty → null.
 */
export const LessonBody = z
  .string()
  .transform((v) => v.replace(/\r\n?/g, '\n').normalize('NFC').trim())
  .pipe(
    z
      .string()
      .max(CONTENT_LIMITS.textChars)
      .refine(
        (v) => !/(?![\n\t‌‍])[\p{Cc}\p{Cf}]/u.test(v),
        'invisible or control characters are not allowed',
      ),
  )
  .transform((v) => (v === '' ? null : v))
  .nullable();

/** D-136: an https address without credentials, stored in its normalised form. */
export const LessonUrl = z
  .string()
  .trim()
  .max(CONTENT_LIMITS.urlChars)
  .pipe(
    z
      .url({
        protocol: /^https$/,
        hostname: /^[^\s]+$/,
        normalize: true,
        error: 'must be an https:// address',
      })
      // No `user:password@` part: it would put a credential in the outline and disguise the real host.
      .refine((v) => !/^https:\/\/[^/?#]*@/i.test(v), 'must not contain a user name or password')
      .pipe(z.string().max(CONTENT_LIMITS.urlChars)),
  )
  .nullable();

const Duration = z.number().int().min(0).max(600).nullable();

/** What a lesson still needs before the course can be published (3.6); null when complete. */
export const LessonMissing = z.enum(['body', 'url', 'file', 'assessment']).nullable();
export type LessonMissing = z.infer<typeof LessonMissing>;

export const ContentAssetRef = z.object({
  id: z.uuid(),
  kind: AssetKind,
  fileName: z.string(),
  status: AssetStatus,
});
export type ContentAssetRef = z.infer<typeof ContentAssetRef>;

export const ContentLesson = z.object({
  id: z.uuid(),
  title: z.string(),
  type: LessonType,
  required: z.boolean(),
  durationMinutes: z.number().int().nullable(),
  completionRule: LessonCompletionRule,
  /** Link lessons: the address. */
  url: z.string().nullable(),
  /** Video and document lessons: the file and its state (a failed or missing file shows a recoverable error). */
  asset: ContentAssetRef.nullable(),
  missing: LessonMissing,
});
export type ContentLesson = z.infer<typeof ContentLesson>;

export const ContentModule = z.object({
  id: z.uuid(),
  title: z.string(),
  lessons: z.array(ContentLesson),
});
export type ContentModule = z.infer<typeof ContentModule>;

/** `GET /courses/:id/draft/content` and the answer to every outline change. */
export const CourseContentView = z.object({
  courseId: z.uuid(),
  courseTitle: z.string(),
  /** The draft's concurrency token after this read or change (shared with the basics form). */
  version: RowVersion,
  /** Whether the caller may change the outline (Tenant Admin); the API checks again on every change. */
  canEdit: z.boolean(),
  modules: z.array(ContentModule),
  totals: z.object({
    modules: z.number().int(),
    lessons: z.number().int(),
    /** Sum of lesson durations: a hint for the course's own estimate. */
    durationMinutes: z.number().int(),
  }),
});
export type CourseContentView = z.infer<typeof CourseContentView>;

/** `GET /courses/:id/draft/lessons/:lessonId`: one lesson with its text, for the editor and the preview. */
export const LessonDetailView = ContentLesson.extend({
  moduleId: z.uuid(),
  body: z.string().nullable(),
  version: RowVersion,
});
export type LessonDetailView = z.infer<typeof LessonDetailView>;

const versioned = { version: RowVersion };

export const CreateModuleBody = z.strictObject({ ...versioned, title: ContentTitle });
export type CreateModuleBody = z.input<typeof CreateModuleBody>;
export const UpdateModuleBody = z.strictObject({ ...versioned, title: ContentTitle });
export type UpdateModuleBody = z.input<typeof UpdateModuleBody>;
/** `DELETE …?version=N`: the token travels in the query (DELETE bodies are dropped by some proxies). Deleting a draft
 * module deletes its lessons (D-137). */
export const DeleteContentQuery = z.strictObject({ version: z.coerce.number().int().min(1) });
export type DeleteContentQuery = z.input<typeof DeleteContentQuery>;

/** The complete new order: every module (or every lesson of the module) exactly once. */
export const ReorderBody = z.strictObject({
  ...versioned,
  ids: z.array(z.uuid()).min(1).max(CONTENT_LIMITS.lessonsPerModule),
});
export type ReorderBody = z.input<typeof ReorderBody>;

/** Content fields per type (D-136): sending one that does not belong to the lesson's type is a 422. */
const contentFields = {
  body: LessonBody.optional(),
  url: LessonUrl.optional(),
  assetId: z.uuid().nullable().optional(),
};

export const CreateLessonBody = z.strictObject({
  ...versioned,
  title: ContentTitle,
  type: LessonType,
  required: z.boolean().optional(),
  durationMinutes: Duration.optional(),
  ...contentFields,
});
export type CreateLessonBody = z.input<typeof CreateLessonBody>;

/** The type is fixed at creation (D-137); everything else may change. */
export const UpdateLessonBody = z.strictObject({
  ...versioned,
  title: ContentTitle.optional(),
  required: z.boolean().optional(),
  durationMinutes: Duration.optional(),
  ...contentFields,
});
export type UpdateLessonBody = z.input<typeof UpdateLessonBody>;

/** Move a lesson to a position (0-based) in a module of the same draft — its own or another. */
export const MoveLessonBody = z.strictObject({
  ...versioned,
  moduleId: z.uuid(),
  position: z
    .number()
    .int()
    .min(0)
    .max(CONTENT_LIMITS.lessonsPerModule - 1),
});
export type MoveLessonBody = z.input<typeof MoveLessonBody>;

/** Which asset kind a lesson type takes, if any (D-136). */
export const LESSON_ASSET_KIND: Partial<Record<LessonType, 'video' | 'document'>> = {
  video: 'video',
  document: 'document',
};
