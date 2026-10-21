import { z } from 'zod';
import { Count, Cursor, IsoInstant, ListLimit, cursorPage } from './common';

/*
 * Course catalogue administration (tenant workspace). Courses are tenant-owned and not branch-owned: every role with
 * `course.read` sees the tenant's courses; only `course.create` / `course.update` / `course.publish` change them.
 * Tenant comes from the session, never from the request.
 */

/** Display status (domain model): Draft = never published; Archived = course archived. No "Under Review" (D-022). */
export const CourseStatus = z.enum(['draft', 'published', 'archived']);
export type CourseStatus = z.infer<typeof CourseStatus>;

/** D-068 (Proposed). */
export const CourseLevel = z.enum(['beginner', 'intermediate', 'advanced']);
export type CourseLevel = z.infer<typeof CourseLevel>;

/** D-068 (Proposed). */
export const DeliveryMode = z.enum(['online', 'classroom', 'blended']);
export type DeliveryMode = z.infer<typeof DeliveryMode>;

export const Category = z.object({ id: z.string(), name: z.string() });
export type Category = z.infer<typeof Category>;

/** GET /api/v1/categories */
export const CategoryList = z.object({ data: z.array(Category) });

export const CourseListItem = z.object({
  id: z.string(),
  title: z.string(),
  category: Category.nullable(),
  level: CourseLevel,
  deliveryMode: DeliveryMode,
  status: CourseStatus,
  /** Number of the current published version; null while never published. */
  publishedVersion: z.number().int().positive().nullable(),
  /** A draft version exists alongside the published one (edits not yet published). */
  hasUnpublishedChanges: z.boolean(),
  moduleCount: Count,
  lessonCount: Count,
  durationMinutes: Count,
  updatedAt: IsoInstant,
});
export type CourseListItem = z.infer<typeof CourseListItem>;

/** Sortable fields are an allowlist; anything else is a 422. */
export const CourseSortField = z.enum(['title', 'updatedAt', 'durationMinutes']);
export type CourseSortField = z.infer<typeof CourseSortField>;

/** GET /api/v1/courses?search=&status=&categoryId=&level=&deliveryMode=&sort=&direction=&cursor=&limit= */
export const CourseListQuery = z
  .object({
    search: z.string().trim().max(100).optional(),
    status: CourseStatus.optional(),
    categoryId: z.string().max(64).optional(),
    level: CourseLevel.optional(),
    deliveryMode: DeliveryMode.optional(),
    sort: CourseSortField.default('updatedAt'),
    direction: z.enum(['asc', 'desc']).default('desc'),
    cursor: Cursor.optional(),
    limit: ListLimit,
  })
  .strict();
export type CourseListQuery = z.input<typeof CourseListQuery>;

export const CourseListPage = cursorPage(CourseListItem);
export type CourseListPage = z.infer<typeof CourseListPage>;
