'use client';

import * as React from 'react';
import Link from 'next/link';
import type { MemberStatus, PeopleListPage, PersonSummary } from '@vachelearn/contracts';
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
import { listPeople } from '@/lib/api/people';
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
const p = t.people;

const ALL = 'all';
const STATUSES: readonly MemberStatus[] = ['active', 'deactivated'];

type Option = { id: string; label: string };

export function roleLabel(role: PersonSummary['roles'][number]) {
  return `${t.roles[role.role]} · ${role.branch ? role.branch.name : p.wholeOrganisation}`;
}

const COLUMNS: DataTableColumn<PersonSummary>[] = [
  {
    id: 'name',
    header: p.columns.name,
    sortField: 'name',
    className: 'whitespace-normal min-w-56',
    cell: (row) => (
      <div className="flex flex-col gap-0.5">
        <Link
          href={`/admin/users/${row.membershipId}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {row.displayName}
        </Link>
        <span className="text-xs break-all text-muted-foreground">{row.email}</span>
      </div>
    ),
  },
  {
    id: 'status',
    header: p.columns.status,
    cell: (row) => <StatusBadge entity="member" status={row.status} />,
  },
  {
    id: 'branches',
    header: p.columns.branches,
    className: 'whitespace-normal',
    cell: (row) =>
      row.branches.length === 0 ? (
        <span className="text-muted-foreground">{p.noBranch}</span>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {row.branches.map((b) => (
            <li key={b.id}>
              {b.name}
              {b.primary ? <span className="text-muted-foreground"> {p.primarySuffix}</span> : null}
            </li>
          ))}
        </ul>
      ),
  },
  {
    id: 'roles',
    header: p.columns.roles,
    className: 'whitespace-normal',
    cell: (row) =>
      row.roles.length === 0 ? (
        <span className="text-muted-foreground">{p.noRole}</span>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {row.roles.map((role) => (
            <li key={`${role.role}:${role.branch?.id ?? 'all'}`}>{roleLabel(role)}</li>
          ))}
        </ul>
      ),
  },
  {
    id: 'jobRole',
    header: p.columns.jobRole,
    cell: (row) => row.jobRole?.name ?? <span className="text-muted-foreground">{p.none}</span>,
  },
  {
    id: 'added',
    header: p.columns.added,
    sortField: 'createdAt',
    cell: (row) => <time dateTime={row.createdAt}>{formatDate(row.createdAt)}</time>,
  },
];

type Filters = {
  search: string;
  status: MemberStatus | typeof ALL;
  branchId: string;
  jobRoleId: string;
};
const NO_FILTERS: Filters = { search: '', status: ALL, branchId: ALL, jobRoleId: ALL };

/**
 * Users of the caller's organisation (UI spec #17, #31; Slice 2.5b). Server-driven: every change asks the API for page
 * 1 of the new query through the same-origin proxy; the API applies tenant and branch scope (D-026), so a filter can
 * never widen what is shown.
 */
export function PeopleList({
  initial,
  branches,
  jobRoles,
  emptyDescription,
}: {
  initial: ApiResult<PeopleListPage>;
  emptyDescription: string;
  /** Branches the caller can see; empty hides the filter. */
  branches: readonly Option[];
  jobRoles: readonly Option[];
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
      branchId: f.branchId === ALL ? undefined : f.branchId,
      jobRoleId: f.jobRoleId === ALL ? undefined : f.jobRoleId,
      sort: (s?.field ?? 'name') as 'name' | 'email' | 'createdAt',
      direction: s?.direction ?? 'asc',
      limit: next.limit ?? limit,
      cursor: next.cursor ?? undefined,
    };
    startTransition(async () => setResult(await listPeople(query)));
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

  const rows = result.ok ? result.data.data : [];
  const nextCursor = result.ok ? result.data.page.nextCursor : null;
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const activeCount = (['status', 'branchId', 'jobRoleId'] as const).filter(
    (key) => filters[key] !== ALL,
  ).length;

  return (
    <DataTable<PersonSummary>
      caption={p.caption}
      columns={COLUMNS}
      rows={rows}
      getRowId={(row) => row.membershipId}
      getRowLabel={(row) => row.displayName}
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
          ? { title: p.noMatchTitle, description: p.noMatchDescription }
          : { title: p.emptyTitle, description: emptyDescription }
      }
      toolbar={
        <FilterBar
          search={{
            value: filters.search,
            onChange: (search) => changeFilters({ ...filters, search }, { debounce: true }),
            label: p.searchLabel,
            placeholder: p.searchPlaceholder,
          }}
          activeCount={activeCount}
          onClear={() => changeFilters(NO_FILTERS)}
        >
          <FilterSelect
            label={p.status}
            value={filters.status}
            allLabel={p.allStatuses}
            options={STATUSES.map((value) => ({ id: value, label: t.status.member[value] }))}
            onChange={(status) =>
              changeFilters({ ...filters, status: status as Filters['status'] })
            }
          />
          {branches.length > 0 ? (
            <FilterSelect
              label={p.branch}
              value={filters.branchId}
              allLabel={p.allBranches}
              options={branches}
              onChange={(branchId) => changeFilters({ ...filters, branchId })}
            />
          ) : null}
          {jobRoles.length > 0 ? (
            <FilterSelect
              label={p.jobRole}
              value={filters.jobRoleId}
              allLabel={p.allJobRoles}
              options={jobRoles}
              onChange={(jobRoleId) => changeFilters({ ...filters, jobRoleId })}
            />
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

function FilterSelect({
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  label: string;
  value: string;
  allLabel: string;
  options: readonly Option[];
  onChange: (value: string) => void;
}) {
  return (
    <FormField label={label} className="md:w-44">
      {(field) => (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger {...field} className="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{allLabel}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}
