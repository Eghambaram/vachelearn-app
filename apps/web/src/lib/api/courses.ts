import {
  CategoryList,
  CourseListPage,
  CourseListQuery,
  type CourseListItem,
  type CourseListPage as CourseListPageData,
} from '@vachelearn/contracts';
import { demoCategories, demoCourses } from '@/mocks/courses';
import { demoError, validationError, type ApiResult, type DemoState } from './client';
import { cursorOffset, encodeCursor, invalidCursor, queryKey } from './cursor';
import { getSession } from './session';

/*
 * GET /api/v1/courses and /categories (tenant workspace, `course.read`). Server-only: the tenant comes from the
 * session. Phase 1 serves demo fixtures with the API's real list semantics — validated query, allowlisted sort,
 * bounded limit, opaque cursors bound to their query — and parses every response with the shared contract.
 */

function compare(
  a: CourseListItem,
  b: CourseListItem,
  field: 'title' | 'updatedAt' | 'durationMinutes',
) {
  const x = a[field];
  const y = b[field];
  return typeof x === 'number' && typeof y === 'number'
    ? x - y
    : String(x).localeCompare(String(y), 'en', { sensitivity: 'base' });
}

export async function listCourses(
  input: unknown,
  { demoState = 'ready', now = new Date() }: { demoState?: DemoState; now?: Date } = {},
): Promise<ApiResult<CourseListPageData>> {
  const parsed = CourseListQuery.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const session = await getSession();
  if (
    demoState === 'forbidden' ||
    !session.activeTenantId ||
    !session.permissions.includes('course.read')
  ) {
    return demoError(403);
  }
  if (demoState === 'error') return demoError(500);

  const { cursor, ...query } = parsed.data;
  const key = queryKey([
    session.activeTenantId,
    query.search ?? '',
    query.status ?? '',
    query.categoryId ?? '',
    query.level ?? '',
    query.deliveryMode ?? '',
    query.sort,
    query.direction,
    query.limit,
  ]);
  let offset = 0;
  if (cursor) {
    const at = cursorOffset(cursor, key);
    if (at === null) return invalidCursor();
    offset = at;
  }

  const term = query.search?.toLowerCase() ?? '';
  const rows = (demoState === 'empty' ? [] : demoCourses(session.activeTenantId, now))
    .filter(
      (c) =>
        (!term || c.title.toLowerCase().includes(term)) &&
        (!query.status || c.status === query.status) &&
        (!query.categoryId || c.category?.id === query.categoryId) &&
        (!query.level || c.level === query.level) &&
        (!query.deliveryMode || c.deliveryMode === query.deliveryMode),
    )
    // Stable order: the sort field, then id, so pages never overlap or skip.
    .sort((a, b) => {
      const primary = compare(a, b, query.sort);
      return (query.direction === 'asc' ? primary : -primary) || a.id.localeCompare(b.id);
    });

  const data = rows.slice(offset, offset + query.limit);
  const next = offset + query.limit;
  return {
    ok: true,
    data: CourseListPage.parse({
      data,
      page: {
        nextCursor: next < rows.length ? encodeCursor(next, key) : null,
        limit: query.limit,
      },
    }),
  };
}

export async function listCategories(): Promise<
  ApiResult<{ data: { id: string; name: string }[] }>
> {
  const session = await getSession();
  if (!session.activeTenantId || !session.permissions.includes('course.read'))
    return demoError(403);
  return { ok: true, data: CategoryList.parse({ data: demoCategories(session.activeTenantId) }) };
}
