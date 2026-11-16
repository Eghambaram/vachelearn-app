'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  CourseLanguage,
  type CategoryView,
  type CourseAdminListItem,
  type CourseAdminListPage,
  type CourseLevel,
  type CourseStatus,
} from '@vachelearn/contracts';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { FormField } from '@/components/form-field';
import { Pagination } from '@/components/pagination';
import { StatusBadge } from '@/components/status-badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ApiResult } from '@/lib/api/client';
import { assetContentUrl, listAdminCourses } from '@/lib/api/course-admin';
import { formatDate } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import {
  DEFAULT_PAGE_LIMIT,
  useCursorPagination,
  type PageLimit,
  type SortState,
} from '@/lib/table';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const c = t.courseAdmin;

const ALL = 'all';
const STATUSES: readonly CourseStatus[] = ['draft', 'published', 'archived'];
const LEVELS: readonly CourseLevel[] = ['beginner', 'intermediate', 'advanced'];

const COLUMNS: DataTableColumn<CourseAdminListItem>[] = [
  {
    id: 'title',
    header: c.columns.course,
    sortField: 'title',
    className: 'whitespace-normal min-w-56',
    cell: (row) => (
      <span className="flex items-center gap-3">
        {row.coverAssetId ? (
          // Decorative: the title next to it names the course. A signed link, so not next/image (no caching).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetContentUrl(row.coverAssetId)}
            alt=""
            loading="lazy"
            className="h-9 w-14 shrink-0 rounded border object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="h-9 w-14 shrink-0 rounded border border-dashed bg-muted"
          />
        )}
        <Link
          href={`/admin/courses/${row.id}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {row.title}
        </Link>
      </span>
    ),
  },
  {
    id: 'category',
    header: c.columns.category,
    className: 'whitespace-normal',
    cell: (row) =>
      row.category
        ? row.category.status === 'archived'
          ? `${row.category.name} ${c.archivedSuffix}`
          : row.category.name
        : c.uncategorised,
  },
  {
    id: 'status',
    header: c.columns.status,
    cell: (row) => <StatusBadge entity="course" status={row.status} />,
  },
  {
    id: 'level',
    header: c.columns.level,
    cell: (row) => (row.level ? t.courses.levels[row.level] : c.notSet),
  },
  { id: 'language', header: c.columns.language, cell: (row) => c.languages[row.language] },
  {
    id: 'updated',
    header: c.columns.updated,
    sortField: 'updatedAt',
    cell: (row) => formatDate(row.updatedAt),
  },
];

type Filters = {
  search: string;
  status: CourseStatus | typeof ALL;
  categoryId: string;
  level: CourseLevel | typeof ALL;
  language: CourseLanguage | typeof ALL;
};
const NO_FILTERS: Filters = { search: '', status: ALL, categoryId: ALL, level: ALL, language: ALL };

/**
 * The organisation's courses through the real API (Slice 3.3, D-127): drafts included for every course reader; the
 * filters narrow the list, never widen it. Sorting by title or last update; cursors are bound to the query.
 */
export function CourseAdminList({
  initial,
  categories,
  canCreate,
}: {
  initial: ApiResult<CourseAdminListPage>;
  /** Category filter options (active and archived: an archived one may still be on courses). */
  categories: readonly CategoryView[];
  canCreate: boolean;
}) {
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS);
  const [sort, setSort] = React.useState<SortState>({ field: 'updatedAt', direction: 'desc' });
  const [limit, setLimit] = React.useState<PageLimit>(DEFAULT_PAGE_LIMIT);
  const [result, setResult] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();
  const pager = useCursorPagination();
  const searchTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  function load(next: {
    filters?: Filters;
    sort?: SortState;
    limit?: PageLimit;
    cursor?: string | null;
  }) {
    const f = next.filters ?? filters;
    const s = next.sort ?? sort;
    const query = {
      search: f.search.trim() || undefined,
      status: f.status === ALL ? undefined : f.status,
      categoryId: f.categoryId === ALL ? undefined : f.categoryId,
      level: f.level === ALL ? undefined : f.level,
      language: f.language === ALL ? undefined : f.language,
      sort: (s?.field ?? 'updatedAt') as 'title' | 'updatedAt',
      direction: s?.direction ?? 'desc',
      limit: next.limit ?? limit,
      cursor: next.cursor ?? undefined,
    };
    startTransition(async () => setResult(await listAdminCourses(query)));
  }

  function changeFilters(next: Filters, { debounce = false } = {}) {
    setFilters(next);
    pager.reset();
    clearTimeout(searchTimer.current);
    if (debounce)
      searchTimer.current = setTimeout(() => load({ filters: next, cursor: null }), 300);
    else load({ filters: next, cursor: null });
  }

  const rows = result.ok ? result.data.data : [];
  const nextCursor = result.ok ? result.data.page.nextCursor : null;
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const activeCount = (['status', 'categoryId', 'level', 'language'] as const).filter(
    (k) => filters[k] !== ALL,
  ).length;

  return (
    <DataTable<CourseAdminListItem>
      caption={c.caption}
      columns={COLUMNS}
      rows={rows}
      getRowId={(row) => row.id}
      getRowLabel={(row) => row.title}
      status={pending ? 'loading' : result.ok ? 'ready' : 'error'}
      error={
        !result.ok
          ? { requestId: result.error.requestId, onRetry: () => load({ cursor: pager.cursor }) }
          : undefined
      }
      sort={sort}
      onSortChange={(next) => {
        setSort(next);
        pager.reset();
        load({ sort: next, cursor: null });
      }}
      empty={
        filtered
          ? { title: c.noMatchTitle, description: c.noMatchDescription }
          : {
              title: c.emptyTitle,
              description: canCreate ? c.emptyDescription : c.emptyReadOnly,
              action: canCreate ? (
                <Link
                  href="/admin/courses/new"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {c.add}
                </Link>
              ) : undefined,
            }
      }
      toolbar={
        <FilterBar
          search={{
            value: filters.search,
            onChange: (search) => changeFilters({ ...filters, search }, { debounce: true }),
            label: c.searchLabel,
            placeholder: c.searchPlaceholder,
          }}
          activeCount={activeCount}
          onClear={() => changeFilters(NO_FILTERS)}
        >
          <FormField label={c.status} className="md:w-40">
            {(field) => (
              <Select
                value={filters.status}
                onValueChange={(status) =>
                  changeFilters({ ...filters, status: status as Filters['status'] })
                }
              >
                <SelectTrigger {...field} className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{c.allStatuses}</SelectItem>
                  {STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t.status.course[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          {categories.length > 0 ? (
            <FormField label={c.category} className="md:w-48">
              {(field) => (
                <Select
                  value={filters.categoryId}
                  onValueChange={(categoryId) => changeFilters({ ...filters, categoryId })}
                >
                  <SelectTrigger {...field} className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{c.allCategories}</SelectItem>
                    {categories.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.status === 'archived'
                          ? `${option.name} ${c.archivedSuffix}`
                          : option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          ) : null}
          <FormField label={c.level} className="md:w-40">
            {(field) => (
              <Select
                value={filters.level}
                onValueChange={(level) =>
                  changeFilters({ ...filters, level: level as Filters['level'] })
                }
              >
                <SelectTrigger {...field} className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{c.allLevels}</SelectItem>
                  {LEVELS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t.courses.levels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label={c.language} className="md:w-40">
            {(field) => (
              <Select
                value={filters.language}
                onValueChange={(language) =>
                  changeFilters({ ...filters, language: language as Filters['language'] })
                }
              >
                <SelectTrigger {...field} className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{c.allLanguages}</SelectItem>
                  {CourseLanguage.options.map((value) => (
                    <SelectItem key={value} value={value}>
                      {c.languages[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        </FilterBar>
      }
      footer={
        <Pagination
          pageIndex={pager.pageIndex}
          hasPrevious={pager.hasPrevious}
          hasNext={nextCursor !== null}
          onPrevious={() => {
            const previous = pager.previousCursor;
            pager.goPrevious();
            load({ cursor: previous });
          }}
          onNext={() => {
            if (!nextCursor) return;
            pager.goNext(nextCursor);
            load({ cursor: nextCursor });
          }}
          limit={limit}
          onLimitChange={(next) => {
            setLimit(next);
            pager.reset();
            load({ limit: next, cursor: null });
          }}
          disabled={pending}
        />
      }
    />
  );
}
