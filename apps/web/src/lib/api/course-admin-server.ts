import { CategoryListPage, CourseAdminListPage, CourseAdminView } from '@vachelearn/contracts';
import { queryString } from './browser';
import type { CatalogKind } from './course-admin';
import { serverRead } from './server';

/*
 * First render of the course and catalog screens (Slice 3.3): reads on the server with the browser's session cookie.
 * The API decides tenant and permissions (D-127); these functions only ask.
 */

const PATH: Record<CatalogKind, string> = { category: '/categories', tag: '/tags' };

export const readCatalogItems = (
  kind: CatalogKind,
  query: Record<string, string | undefined> = {},
) => serverRead(`${PATH[kind]}${queryString(query)}`, (d) => CategoryListPage.parse(d));

export const readAdminCourses = (query: Record<string, string | undefined> = {}) =>
  serverRead(`/courses${queryString(query)}`, (d) => CourseAdminListPage.parse(d));

export const readAdminCourse = (courseId: string) =>
  serverRead(`/courses/${encodeURIComponent(courseId)}`, (d) => CourseAdminView.parse(d));
