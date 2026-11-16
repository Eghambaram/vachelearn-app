import {
  CategoryListPage,
  CategoryView,
  CourseAdminListPage,
  CourseAdminView,
  type CatalogItemListQuery,
  type CourseAdminListQuery,
  type CreateCourseBody,
  type UpdateCourseDraftBody,
} from '@vachelearn/contracts';
import { call, queryString } from './browser';

/*
 * Categories, tags and course drafts from the browser (Slice 3.3) through the same-origin `/api/v1` proxy. The tenant
 * is always the session's — no call names one; every change carries the CSRF token the caller read fresh, and edits
 * name the version they read. Categories and tags share one shape (`kind`).
 */

export type CatalogKind = 'category' | 'tag';
const PATH: Record<CatalogKind, string> = { category: '/categories', tag: '/tags' };
const id = (value: string) => encodeURIComponent(value);
const limitOf = (limit: unknown) => (limit === undefined ? undefined : Number(limit));
const item = (d: unknown) => CategoryView.parse(d);
const course = (d: unknown) => CourseAdminView.parse(d);

export const listCatalogItems = (kind: CatalogKind, query: CatalogItemListQuery) =>
  call(
    `${PATH[kind]}${queryString({ ...query, limit: limitOf(query.limit) })}`,
    { method: 'GET' },
    (d) => CategoryListPage.parse(d),
  );

export const createCatalogItem = (kind: CatalogKind, name: string, csrfToken: string) =>
  call(PATH[kind], { method: 'POST', body: { name }, csrfToken }, item);

export const renameCatalogItem = (
  kind: CatalogKind,
  itemId: string,
  version: number,
  name: string,
  csrfToken: string,
) =>
  call(
    `${PATH[kind]}/${id(itemId)}`,
    { method: 'PATCH', body: { version, name }, csrfToken },
    item,
  );

export const setCatalogItemArchived = (
  kind: CatalogKind,
  itemId: string,
  archived: boolean,
  reason: string,
  csrfToken: string,
) =>
  call(
    `${PATH[kind]}/${id(itemId)}/${archived ? 'archive' : 'reactivate'}`,
    { method: 'POST', body: { reason }, csrfToken },
    item,
  );

export const listAdminCourses = (query: CourseAdminListQuery) =>
  call(
    `/courses${queryString({ ...query, limit: limitOf(query.limit) })}`,
    { method: 'GET' },
    (d) => CourseAdminListPage.parse(d),
  );

export const createCourse = (body: CreateCourseBody, csrfToken: string) =>
  call('/courses', { method: 'POST', body, csrfToken }, course);

export const saveCourseDraft = (courseId: string, body: UpdateCourseDraftBody, csrfToken: string) =>
  call(`/courses/${id(courseId)}/draft`, { method: 'PATCH', body, csrfToken }, course);
