import { createHash } from 'node:crypto';
import {
  CategoryList,
  CourseListPage,
  CourseListQuery,
  type CourseListItem,
  type CourseListPage as CourseListPageData,
} from '@vachelearn/contracts';
import { demoCategories, demoCourses } from '@/mocks/courses';
import { demoError, validationError, type ApiResult, type DemoState } from './client';
import { getSession } from './session';

/*
 * GET /api/v1/courses and /categories (tenant workspace, `course.read`). Server-only: the tenant comes from the
 * session. Phase 1 serves demo fixtures with the API's real list semantics — validated query, allowlisted sort,
 * bounded limit, opaque cursors bound to their query — and parses every response with the shared contract.
 */

type CursorBody = { o: number; k: string };

/** Fingerprint of everything that defines the result set; a cursor is only valid for the same query. */
function queryKey(
  query: Omit<ReturnType<typeof CourseListQuery.parse>, 'cursor'>,
  tenantId: string,
) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        tenantId,
        query.search ?? '',
        query.status ?? '',
        query.categoryId ?? '',
        query.level ?? '',
        query.deliveryMode ?? '',
        query.sort,
        query.direction,
        query.limit,
      ]),
    )
    .digest('base64url')
    .slice(0, 16);
}

function encodeCursor(body: CursorBody) {
  return Buffer.from(JSON.stringify(body)).toString('base64url');
}

function decodeCursor(cursor: string): CursorBody | null {
  try {
    const body = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<CursorBody>;
    return Number.isSafeInteger(body.o) && (body.o ?? -1) >= 0 && typeof body.k === 'string'
      ? (body as CursorBody)
      : null;
  } catch {
    return null;
  }
}

function invalidCursor(): ApiResult<never> {
  return {
    ok: false,
    status: 422,
    error: {
      code: 'INVALID_CURSOR',
      message: 'Invalid cursor',
      requestId: 'req_demo_0422',
      fieldErrors: [
        { field: 'cursor', code: 'invalid', message: 'Cursor does not match this query' },
      ],
    },
  };
}

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
  const key = queryKey(query, session.activeTenantId);
  let offset = 0;
  if (cursor) {
    const body = decodeCursor(cursor);
    if (!body || body.k !== key) return invalidCursor();
    offset = body.o;
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
        nextCursor: next < rows.length ? encodeCursor({ o: next, k: key }) : null,
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
