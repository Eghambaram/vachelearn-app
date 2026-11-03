'use client';

import * as React from 'react';
import Link from 'next/link';
import type { BranchListPage, BranchStatus, BranchView } from '@vachelearn/contracts';
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
import { listBranches } from '@/lib/api/tenancy';
import { getMessages } from '@/lib/i18n';
import {
  DEFAULT_PAGE_LIMIT,
  useCursorPagination,
  type PageLimit,
  type SortState,
} from '@/lib/table';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const b = t.branches;

const ALL = 'all';
const STATUSES: readonly BranchStatus[] = ['active', 'inactive'];

const COLUMNS: DataTableColumn<BranchView>[] = [
  {
    id: 'name',
    header: b.columns.name,
    sortField: 'name',
    className: 'whitespace-normal min-w-48',
    cell: (row) => (
      <Link
        href={`/admin/branches/${row.id}`}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {row.name}
      </Link>
    ),
  },
  { id: 'code', header: b.columns.code, sortField: 'code', cell: (row) => row.code },
  {
    id: 'location',
    header: b.columns.location,
    className: 'whitespace-normal',
    cell: (row) =>
      [row.city, row.region, row.countryCode].filter(Boolean).join(', ') || (
        <span className="text-muted-foreground">{b.none}</span>
      ),
  },
  { id: 'timezone', header: b.columns.timezone, cell: (row) => row.timezone.replaceAll('_', ' ') },
  {
    id: 'status',
    header: b.columns.status,
    cell: (row) => <StatusBadge entity="branch" status={row.status} />,
  },
];

type Filters = { search: string; status: BranchStatus | typeof ALL };
const NO_FILTERS: Filters = { search: '', status: ALL };

/**
 * Branches the caller can see (UI spec #16; Slice 2.5c): a Tenant Admin sees all, a branch-scoped role only its own
 * (the API scopes every query). Server-driven: each change asks the API for page 1 of the new query.
 */
export function BranchList({
  initial,
  canCreate,
}: {
  initial: ApiResult<BranchListPage>;
  canCreate: boolean;
}) {
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS);
  const [sort, setSort] = React.useState<SortState>({ field: 'name', direction: 'asc' });
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
      sort: (s?.field ?? 'name') as 'name' | 'code' | 'createdAt',
      direction: s?.direction ?? 'asc',
      limit: next.limit ?? limit,
      cursor: next.cursor ?? undefined,
    };
    startTransition(async () => setResult(await listBranches(query)));
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

  return (
    <DataTable<BranchView>
      caption={b.caption}
      columns={COLUMNS}
      rows={rows}
      getRowId={(row) => row.id}
      getRowLabel={(row) => row.name}
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
          ? { title: b.noMatchTitle, description: b.noMatchDescription }
          : {
              title: b.emptyTitle,
              description: canCreate ? b.emptyDescription : b.emptyReadOnly,
              action: canCreate ? (
                <Link
                  href="/admin/branches/new"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {b.add}
                </Link>
              ) : undefined,
            }
      }
      toolbar={
        <FilterBar
          search={{
            value: filters.search,
            onChange: (search) => changeFilters({ ...filters, search }, { debounce: true }),
            label: b.searchLabel,
            placeholder: b.searchPlaceholder,
          }}
          activeCount={filters.status === ALL ? 0 : 1}
          onClear={() => changeFilters(NO_FILTERS)}
        >
          <FormField label={b.status} className="md:w-44">
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
                  <SelectItem value={ALL}>{b.allStatuses}</SelectItem>
                  {STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t.status.branch[value]}
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
