'use client';

import * as React from 'react';
import Link from 'next/link';
import type {
  Category,
  CourseLevel,
  CourseListItem,
  CourseListPage,
  CourseStatus,
  DeliveryMode,
} from '@vachelearn/contracts';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { FormField } from '@/components/form-field';
import { Pagination } from '@/components/pagination';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ApiResult, DemoState } from '@/lib/api/client';
import { formatDate, formatDuration } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import {
  DEFAULT_PAGE_LIMIT,
  useCursorPagination,
  type PageLimit,
  type SortState,
} from '@/lib/table';
import { listCoursesAction } from './actions';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const c = t.courses;

const ALL = 'all';
const STATUSES: readonly CourseStatus[] = ['published', 'draft', 'archived'];
const LEVELS: readonly CourseLevel[] = ['beginner', 'intermediate', 'advanced'];
const MODES: readonly DeliveryMode[] = ['online', 'classroom', 'blended'];

function columnsFor(canEdit: boolean): DataTableColumn<CourseListItem>[] {
  return [
    {
      id: 'title',
      header: c.columns.course,
      sortField: 'title',
      className: 'whitespace-normal min-w-56',
      cell: (row) => (
        <div className="flex flex-col gap-0.5">
          {canEdit && row.status !== 'archived' ? (
            <Link
              href={`/admin/courses/${row.id}/build`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {row.title}
            </Link>
          ) : (
            <span className="font-medium">{row.title}</span>
          )}
          <span className="text-xs text-muted-foreground">
            {row.category?.name ?? c.uncategorised}
          </span>
        </div>
      ),
    },
    {
      id: 'status',
      header: c.columns.status,
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge entity="course" status={row.status} />
          {row.publishedVersion ? (
            <span className="text-xs text-muted-foreground">{c.version(row.publishedVersion)}</span>
          ) : null}
          {row.hasUnpublishedChanges ? (
            <Badge variant="outline">{c.unpublishedChanges}</Badge>
          ) : null}
        </div>
      ),
    },
    { id: 'level', header: c.columns.level, cell: (row) => c.levels[row.level] },
    {
      id: 'delivery',
      header: c.columns.delivery,
      cell: (row) => c.deliveryModes[row.deliveryMode],
    },
    {
      id: 'structure',
      header: c.columns.structure,
      cell: (row) => c.structure(row.moduleCount, row.lessonCount),
    },
    {
      id: 'duration',
      header: c.columns.duration,
      sortField: 'durationMinutes',
      align: 'end',
      cell: (row) => formatDuration(row.durationMinutes),
    },
    {
      id: 'updated',
      header: c.columns.updated,
      sortField: 'updatedAt',
      cell: (row) => <time dateTime={row.updatedAt}>{formatDate(row.updatedAt)}</time>,
    },
  ];
}

type Filters = {
  search: string;
  status: CourseStatus | typeof ALL;
  categoryId: string;
  level: CourseLevel | typeof ALL;
  deliveryMode: DeliveryMode | typeof ALL;
};

const NO_FILTERS: Filters = {
  search: '',
  status: ALL,
  categoryId: ALL,
  level: ALL,
  deliveryMode: ALL,
};

/**
 * Server-driven course list (UI spec #21): every change asks the server for page 1 of the new query; the client never
 * filters or sorts rows itself. Read-only until the builder (1.5.3b) adds create/edit actions for `course.update`.
 */
export function CourseList({
  initial,
  categories,
  demoState,
  canEdit,
}: {
  initial: ApiResult<CourseListPage> | null;
  categories: readonly Category[];
  demoState: DemoState;
  /** `course.update`: titles link to the builder. The builder re-checks on the server. */
  canEdit: boolean;
}) {
  const columns = React.useMemo(() => columnsFor(canEdit), [canEdit]);
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
      deliveryMode: f.deliveryMode === ALL ? undefined : f.deliveryMode,
      sort: s?.field,
      direction: s?.direction,
      limit: next.limit ?? limit,
      cursor: next.cursor ?? undefined,
    };
    startTransition(async () => setResult(await listCoursesAction(query, demoState)));
  }

  // Any change to what is being asked for starts again at page 1.
  function changeFilters(next: Filters, { debounce = false } = {}) {
    setFilters(next);
    pager.reset();
    clearTimeout(searchTimer.current);
    if (debounce)
      searchTimer.current = setTimeout(() => load({ filters: next, cursor: null }), 300);
    else load({ filters: next, cursor: null });
  }

  const rows = result?.ok ? result.data.data : [];
  const nextCursor = result?.ok ? result.data.page.nextCursor : null;
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const activeCount = (['status', 'categoryId', 'level', 'deliveryMode'] as const).filter(
    (key) => filters[key] !== ALL,
  ).length;

  return (
    <DataTable<CourseListItem>
      caption={c.caption}
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      getRowLabel={(row) => row.title}
      status={result === null || pending ? 'loading' : result.ok ? 'ready' : 'error'}
      error={
        result && !result.ok
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
          : { title: c.emptyTitle, description: c.emptyDescription }
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
          <FilterSelect
            label={c.status}
            value={filters.status}
            allLabel={c.allStatuses}
            options={STATUSES.map((value) => ({ value, label: t.status.course[value] }))}
            onChange={(status) => changeFilters({ ...filters, status })}
          />
          <FilterSelect
            label={c.category}
            value={filters.categoryId}
            allLabel={c.allCategories}
            options={categories.map((category) => ({ value: category.id, label: category.name }))}
            onChange={(categoryId) => changeFilters({ ...filters, categoryId })}
          />
          <FilterSelect
            label={c.level}
            value={filters.level}
            allLabel={c.allLevels}
            options={LEVELS.map((value) => ({ value, label: c.levels[value] }))}
            onChange={(level) => changeFilters({ ...filters, level })}
          />
          <FilterSelect
            label={c.delivery}
            value={filters.deliveryMode}
            allLabel={c.allDelivery}
            options={MODES.map((value) => ({ value, label: c.deliveryModes[value] }))}
            onChange={(deliveryMode) => changeFilters({ ...filters, deliveryMode })}
          />
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

function FilterSelect<V extends string>({
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  label: string;
  value: V | typeof ALL;
  allLabel: string;
  options: readonly { value: V; label: string }[];
  onChange: (value: V | typeof ALL) => void;
}) {
  return (
    <FormField label={label} className="md:w-44">
      {(field) => (
        <Select value={value} onValueChange={(next) => onChange(next as V | typeof ALL)}>
          <SelectTrigger {...field} className="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{allLabel}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}
