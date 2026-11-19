import { z } from 'zod';
import { Cursor, IsoInstant, ListLimit, cursorPage } from './common';
import { CourseLevel, CourseStatus, DeliveryMode } from './courses';
import { LifecycleBody } from './tenancy';

/*
 * Categories, tags and course drafts through the real API (Slice 3.3; spec §6; D-127–D-130; matrix `catalog.manage`,
 * `course.*`). Courses belong to the whole tenant (no branch): every `course.read` holder sees the course list,
 * drafts included, read-only (D-127); only `course.create` / `course.update` change them. Categories and tags are
 * flat lists kept by `catalog.manage` and archived, never deleted (D-128). A course's metadata lives on its versions;
 * the draft is edited with optimistic concurrency (stale `version` → 409). The Phase 1 demo shapes in `courses.ts`
 * and `course-draft.ts` stay for the demo screens.
 */

const Version = z.number().int().min(1);
/** Optimistic-concurrency token of an editable record (stale → 409). */
export const RowVersion = Version;

// ── Categories and tags (D-128) ─────────────────────────────────────────────────────────────────────────────────────

export const CatalogItemStatus = z.enum(['active', 'archived']);
export type CatalogItemStatus = z.infer<typeof CatalogItemStatus>;

/**
 * A short label: NFC-normalised, and no control, bidi-override or zero-width characters, so two names that look the
 * same are the same and nothing displays reversed (security review 3.3). Titles may keep the zero-width joiner and
 * non-joiner (U+200D, U+200C): Indic scripts (D-129) need them for half forms and conjuncts.
 */
const Label = (min: number, max: number, { joiners = false } = {}) =>
  z
    .string()
    .trim()
    .transform((v) => v.normalize('NFC'))
    .pipe(
      z
        .string()
        .min(min)
        .max(max)
        .refine(
          (v) => !(joiners ? /(?![\u200c\u200d])[\p{Cc}\p{Cf}]/u : /[\p{Cc}\p{Cf}]/u).test(v),
          'invisible or control characters are not allowed',
        ),
    );

/** A trimmed, NFC label with no invisible or control characters (titles: Indic joiners allowed). */
export const PlainLabel = Label;

export const CategoryName = Label(2, 60);
export const TagName = Label(2, 40);

const catalogItemView = {
  id: z.uuid(),
  name: z.string(),
  status: CatalogItemStatus,
  archivedAt: IsoInstant.nullable(),
  /** Free text: shown only to catalog managers (null for other readers). */
  archivedReason: z.string().nullable(),
  version: Version,
  createdAt: IsoInstant,
  updatedAt: IsoInstant,
};

export const CategoryView = z.object(catalogItemView);
export type CategoryView = z.infer<typeof CategoryView>;
export const TagView = z.object(catalogItemView);
export type TagView = z.infer<typeof TagView>;

export const CreateCategoryBody = z.strictObject({ name: CategoryName });
export type CreateCategoryBody = z.input<typeof CreateCategoryBody>;
export const UpdateCategoryBody = z.strictObject({ version: Version, name: CategoryName });
export type UpdateCategoryBody = z.input<typeof UpdateCategoryBody>;
export const CreateTagBody = z.strictObject({ name: TagName });
export type CreateTagBody = z.input<typeof CreateTagBody>;
export const UpdateTagBody = z.strictObject({ version: Version, name: TagName });
export type UpdateTagBody = z.input<typeof UpdateTagBody>;

/** Archive or reactivate a category or tag: the reason is recorded. */
export const CatalogItemLifecycleBody = LifecycleBody;

/** `GET /categories`, `GET /tags`: by name. Instructors (assigned reach) get an empty list until 5.5 (D-127). */
export const CatalogItemListQuery = z.strictObject({
  status: CatalogItemStatus.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  cursor: Cursor.optional(),
  limit: ListLimit,
});
export type CatalogItemListQuery = z.input<typeof CatalogItemListQuery>;
export const CategoryListPage = cursorPage(CategoryView);
export type CategoryListPage = z.infer<typeof CategoryListPage>;
export const TagListPage = cursorPage(TagView);
export type TagListPage = z.infer<typeof TagListPage>;

// ── Courses and drafts (D-127, D-129, D-130) ────────────────────────────────────────────────────────────────────────

/** D-129: the languages a course can be taught in (BCP 47). The interface itself stays English (D-028). */
export const CourseLanguage = z.enum(['en', 'hi', 'mr', 'gu', 'ta', 'te', 'kn', 'ml', 'bn', 'pa']);
export type CourseLanguage = z.infer<typeof CourseLanguage>;

export const CourseTitle = Label(3, 120, { joiners: true });
const OptionalText = (max: number) => z.string().trim().min(1).max(max).nullable();
/** D-128: at most 10 tags per version. */
export const MAX_COURSE_TAGS = 10;

/** The basics a draft holds (builder step 1). Everything but the title may stay empty until publish (3.6). */
export const CourseBasicsFields = {
  title: CourseTitle,
  summary: OptionalText(300),
  description: OptionalText(5000),
  categoryId: z.uuid().nullable(),
  tagIds: z
    .array(z.uuid())
    .max(MAX_COURSE_TAGS)
    .refine((ids) => new Set(ids).size === ids.length, 'duplicate tag'),
  level: CourseLevel.nullable(),
  deliveryMode: DeliveryMode.nullable(),
  language: CourseLanguage,
  durationMinutes: z.number().int().min(1).max(10000).nullable(),
  objectives: z.array(z.string().trim().min(1).max(200)).max(20),
  audience: OptionalText(500),
  prerequisites: OptionalText(500),
  /** A ready image asset of this tenant (3.4, D-133); null removes the cover. */
  coverAssetId: z.uuid().nullable(),
};

/** `POST /courses`: creates the course and its first draft. Only the title is required. */
export const CreateCourseBody = z.strictObject({
  title: CourseTitle,
  summary: CourseBasicsFields.summary.optional(),
  categoryId: CourseBasicsFields.categoryId.optional(),
  level: CourseBasicsFields.level.optional(),
  deliveryMode: CourseBasicsFields.deliveryMode.optional(),
  language: CourseLanguage.optional(),
});
export type CreateCourseBody = z.input<typeof CreateCourseBody>;

/** `PATCH /courses/:id/draft`: the fields to change, naming the draft version read (stale → 409 `CONFLICT`). */
export const UpdateCourseDraftBody = z
  .strictObject({
    version: Version,
    title: CourseBasicsFields.title.optional(),
    summary: CourseBasicsFields.summary.optional(),
    description: CourseBasicsFields.description.optional(),
    categoryId: CourseBasicsFields.categoryId.optional(),
    tagIds: CourseBasicsFields.tagIds.optional(),
    level: CourseBasicsFields.level.optional(),
    deliveryMode: CourseBasicsFields.deliveryMode.optional(),
    language: CourseBasicsFields.language.optional(),
    durationMinutes: CourseBasicsFields.durationMinutes.optional(),
    objectives: CourseBasicsFields.objectives.optional(),
    audience: CourseBasicsFields.audience.optional(),
    prerequisites: CourseBasicsFields.prerequisites.optional(),
    coverAssetId: CourseBasicsFields.coverAssetId.optional(),
  })
  .refine((b) => Object.keys(b).some((k) => k !== 'version'), 'nothing to change');
export type UpdateCourseDraftBody = z.input<typeof UpdateCourseDraftBody>;

const ItemRef = z.object({ id: z.uuid(), name: z.string(), status: CatalogItemStatus });

export const CourseDraftView = z.object({
  id: z.uuid(),
  /** Optimistic-concurrency token: name it on the next save. */
  version: Version,
  title: z.string(),
  summary: z.string().nullable(),
  description: z.string().nullable(),
  /** An archived category or tag stays on the draft (shown as archived) until changed. */
  category: ItemRef.nullable(),
  tags: z.array(ItemRef),
  level: CourseLevel.nullable(),
  deliveryMode: DeliveryMode.nullable(),
  language: CourseLanguage,
  durationMinutes: z.number().int().nullable(),
  objectives: z.array(z.string()),
  audience: z.string().nullable(),
  prerequisites: z.string().nullable(),
  /** The cover image, read through `GET /assets/:id/content` (D-133). */
  cover: z.object({ id: z.uuid(), fileName: z.string() }).nullable(),
  updatedAt: IsoInstant,
});
export type CourseDraftView = z.infer<typeof CourseDraftView>;

export const CourseAdminView = z.object({
  id: z.uuid(),
  slug: z.string(),
  /** Display status: draft until first published (3.6), archived once archived. */
  status: CourseStatus,
  owner: z.object({ membershipId: z.uuid(), displayName: z.string() }),
  /** Number of the current published version; null while never published. */
  publishedVersion: z.number().int().positive().nullable(),
  /** The draft being edited, if one exists. */
  draft: CourseDraftView.nullable(),
  createdAt: IsoInstant,
  updatedAt: IsoInstant,
  /** Whether this caller may edit the draft (`course.update`). The API checks again on every save. */
  canEdit: z.boolean(),
});
export type CourseAdminView = z.infer<typeof CourseAdminView>;

/** One row of the admin course list: the draft's (else the published version's) title and basics. */
export const CourseAdminListItem = z.object({
  id: z.uuid(),
  title: z.string(),
  category: ItemRef.nullable(),
  level: CourseLevel.nullable(),
  deliveryMode: DeliveryMode.nullable(),
  language: CourseLanguage,
  durationMinutes: z.number().int().nullable(),
  /** The shown version's cover image (draft, else published), for the list thumbnail. */
  coverAssetId: z.uuid().nullable(),
  status: CourseStatus,
  publishedVersion: z.number().int().positive().nullable(),
  hasUnpublishedChanges: z.boolean(),
  updatedAt: IsoInstant,
});
export type CourseAdminListItem = z.infer<typeof CourseAdminListItem>;

/** `GET /courses`: filters narrow; sort is an allowlist; cursors are bound to the query. */
export const CourseAdminListQuery = z.strictObject({
  search: z.string().trim().min(1).max(100).optional(),
  status: CourseStatus.optional(),
  categoryId: z.uuid().optional(),
  level: CourseLevel.optional(),
  deliveryMode: DeliveryMode.optional(),
  language: CourseLanguage.optional(),
  sort: z.enum(['title', 'updatedAt']).default('updatedAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  cursor: Cursor.optional(),
  limit: ListLimit,
});
export type CourseAdminListQuery = z.input<typeof CourseAdminListQuery>;
export const CourseAdminListPage = cursorPage(CourseAdminListItem);
export type CourseAdminListPage = z.infer<typeof CourseAdminListPage>;
