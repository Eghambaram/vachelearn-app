'use client';

import * as React from 'react';
import Link from 'next/link';
import type { GroupListPage, GroupStatus, GroupView } from '@vachelearn/contracts';
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
import { listGroups } from '@/lib/api/groups';
import { getMessages } from '@/lib/i18n';
import {
  DEFAULT_PAGE_LIMIT,
  useCursorPagination,
  type PageLimit,
  type SortState,
} from '@/lib/table';
import { WHOLE_ORGANISATION, type ScopeOption } from './group-form';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const g = t.groups;

const ALL = 'all';
const STATUSES: readonly GroupStatus[] = ['active', 'archived'];

const COLUMNS: DataTableColumn<GroupView>[] = [
  {
    id: 'name',
    header: g.columns.name,
    sortField: 'name',
    className: 'whitespace-normal min-w-48',
    cell: (row) => (
      <Link
        href={`/admin/groups/${row.id}`}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {row.name}
      </Link>
    ),
  },
  {
    id: 'scope',
    header: g.columns.scope,
    className: 'whitespace-normal',
    cell: (row) => (row.branch ? g.branchScope(row.branch.name) : g.wholeOrganisation),
  },
  { id: 'members', header: g.columns.members, cell: (row) => row.memberCount },
  {
    id: 'status',
    header: g.columns.status,
    cell: (row) => <StatusBadge entity="group" status={row.status} />,
  },
];

type Filters = { search: string; status: GroupStatus | typeof ALL; scope: string };
const NO_FILTERS: Filters = { search: '', status: ALL, scope: ALL };

/**
 * Groups the caller can see (Slice 3.2, D-121): a tenant-wide caller sees all, a branch-scoped one only its branches'
 * groups (the API scopes every query; the scope filter narrows it, never widens it).
 */
export function GroupList({
  initial,
  scopes,
  canCreate,
}: {
  initial: ApiResult<GroupListPage>;
  /** Scope filter options: `tenant` (whole organisation) for tenant-wide callers, then the branches they can see. */
  scopes: readonly ScopeOption[];
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
      scope: f.scope === WHOLE_ORGANISATION ? ('tenant' as const) : undefined,
      branchId: f.scope === ALL || f.scope === WHOLE_ORGANISATION ? undefined : f.scope,
      sort: (s?.field ?? 'name') as 'name' | 'createdAt',
      direction: s?.direction ?? 'asc',
      limit: next.limit ?? limit,
      cursor: next.cursor ?? undefined,
    };
    startTransition(async () => setResult(await listGroups(query)));
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
  const activeCount = (filters.status === ALL ? 0 : 1) + (filters.scope === ALL ? 0 : 1);

  return (
    <DataTable<GroupView>
      caption={g.caption}
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
          ? { title: g.noMatchTitle, description: g.noMatchDescription }
          : {
              title: g.emptyTitle,
              description: canCreate ? g.emptyDescription : g.emptyReadOnly,
              action: canCreate ? (
                <Link
                  href="/admin/groups/new"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {g.add}
                </Link>
              ) : undefined,
            }
      }
      toolbar={
        <FilterBar
          search={{
            value: filters.search,
            onChange: (search) => changeFilters({ ...filters, search }, { debounce: true }),
            label: g.searchLabel,
            placeholder: g.searchPlaceholder,
          }}
          activeCount={activeCount}
          onClear={() => changeFilters(NO_FILTERS)}
        >
          <FormField label={g.status} className="md:w-44">
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
                  <SelectItem value={ALL}>{g.allStatuses}</SelectItem>
                  {STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t.status.group[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          {scopes.length > 1 ? (
            <FormField label={g.scope} className="md:w-56">
              {(field) => (
                <Select
                  value={filters.scope}
                  onValueChange={(scope) => changeFilters({ ...filters, scope })}
                >
                  <SelectTrigger {...field} className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{g.allScopes}</SelectItem>
                    {scopes.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          ) : null}
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
