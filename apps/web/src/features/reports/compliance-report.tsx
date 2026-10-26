'use client';

import * as React from 'react';
import type {
  ComplianceReport as ComplianceReportData,
  ComplianceReportOptions,
  ComplianceReportRow,
  ComplianceStatus,
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
import type { ApiResult, DemoState } from '@/lib/api/client';
import { formatDateOnly, formatDateTime } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import {
  DEFAULT_PAGE_LIMIT,
  useCursorPagination,
  type PageLimit,
  type SortState,
} from '@/lib/table';
import { complianceReportAction } from './actions';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const r = t.reports;

const ALL = 'all';
const STATUSES: readonly ComplianceStatus[] = [
  'overdue',
  'due_soon',
  'not_started',
  'compliant',
  'not_applicable',
];

const date = (value: string | null) => (value ? formatDateOnly(value) : r.noDate);

const COLUMNS: DataTableColumn<ComplianceReportRow>[] = [
  {
    id: 'learner',
    header: r.columns.learner,
    sortField: 'learner',
    className: 'whitespace-normal min-w-44',
    cell: (row) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{row.learnerName}</span>
        <span className="text-xs text-muted-foreground">
          {row.branches.map((b) => (b.primary ? `${b.name} (${r.primary})` : b.name)).join(', ')}
        </span>
      </div>
    ),
  },
  {
    id: 'status',
    header: r.columns.status,
    sortField: 'status',
    cell: (row) => <StatusBadge entity="compliance" status={row.status} />,
  },
  {
    id: 'course',
    header: r.columns.course,
    className: 'whitespace-normal min-w-44',
    cell: (row) => row.courseTitle,
  },
  { id: 'due', header: r.columns.due, sortField: 'dueOn', cell: (row) => date(row.dueOn) },
  { id: 'completed', header: r.columns.completed, cell: (row) => date(row.completedOn) },
  { id: 'valid', header: r.columns.validThrough, cell: (row) => date(row.validThrough) },
  {
    id: 'progress',
    header: r.columns.progress,
    align: 'end',
    cell: (row) => (row.status === 'not_applicable' ? r.noDate : `${row.progressPercent}%`),
  },
];

type Filters = { branchId: string; courseId: string; status: ComplianceStatus | typeof ALL };
const NO_FILTERS: Filters = { branchId: ALL, courseId: ALL, status: ALL };

/**
 * Compliance status report (UI spec #29, ref 07): server-driven — every change asks the server for page 1 of the new
 * query, and the scope banner and totals describe exactly what the server counted for the result on screen.
 */
export function ComplianceReport({
  initial,
  options,
  demoState,
}: {
  initial: ApiResult<ComplianceReportData> | null;
  options: ComplianceReportOptions;
  demoState: DemoState;
}) {
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS);
  const [sort, setSort] = React.useState<SortState>({ field: 'status', direction: 'asc' });
  const [limit, setLimit] = React.useState<PageLimit>(DEFAULT_PAGE_LIMIT);
  const [result, setResult] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();
  const pager = useCursorPagination();

  function load(next: {
    filters?: Filters;
    sort?: SortState;
    limit?: PageLimit;
    cursor?: string | null;
  }) {
    const f = next.filters ?? filters;
    const s = next.sort ?? sort;
    const query = {
      branchId: f.branchId === ALL ? undefined : f.branchId,
      courseId: f.courseId === ALL ? undefined : f.courseId,
      status: f.status === ALL ? undefined : f.status,
      sort: s?.field,
      direction: s?.direction,
      limit: next.limit ?? limit,
      cursor: next.cursor ?? undefined,
    };
    startTransition(async () => setResult(await complianceReportAction(query, demoState)));
  }

  function changeFilters(next: Filters) {
    setFilters(next);
    pager.reset();
    load({ filters: next, cursor: null });
  }

  const data = result?.ok ? result.data : null;
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const activeCount = (['branchId', 'courseId', 'status'] as const).filter(
    (key) => filters[key] !== ALL,
  ).length;

  return (
    <div className="flex flex-col gap-4">
      {data ? <ScopeBanner data={data} /> : null}
      {data ? <Totals data={data} /> : null}
      <DataTable<ComplianceReportRow>
        caption={r.caption}
        columns={COLUMNS}
        rows={data?.data ?? []}
        getRowId={(row) => row.id}
        getRowLabel={(row) => `${row.learnerName}, ${row.courseTitle}`}
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
            ? { title: r.noMatchTitle, description: r.noMatchDescription }
            : { title: r.emptyTitle, description: r.emptyDescription }
        }
        toolbar={
          <FilterBar activeCount={activeCount} onClear={() => changeFilters(NO_FILTERS)}>
            <FilterSelect
              label={r.branch}
              value={filters.branchId}
              allLabel={r.allBranches}
              options={options.branches.map((b) => ({ value: b.id, label: b.name }))}
              onChange={(branchId) => changeFilters({ ...filters, branchId })}
            />
            <FilterSelect
              label={r.course}
              value={filters.courseId}
              allLabel={r.allCourses}
              options={options.courses.map((c) => ({ value: c.id, label: c.name }))}
              onChange={(courseId) => changeFilters({ ...filters, courseId })}
            />
            <FilterSelect
              label={r.status}
              value={filters.status}
              allLabel={r.allStatuses}
              options={STATUSES.map((value) => ({ value, label: t.status.compliance[value] }))}
              onChange={(status) => changeFilters({ ...filters, status })}
            />
          </FilterBar>
        }
        footer={
          <Pagination
            pageIndex={pager.pageIndex}
            hasPrevious={pager.hasPrevious}
            hasNext={(data?.page.nextCursor ?? null) !== null}
            onPrevious={() => {
              const previous = pager.previousCursor;
              pager.goPrevious();
              load({ cursor: previous });
            }}
            onNext={() => {
              const nextCursor = data?.page.nextCursor;
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
    </div>
  );
}

/** "Scope: … · Filters: … · Generated … IST" — what was counted, from the server's own echo (spec §11). */
function ScopeBanner({ data }: { data: ComplianceReportData }) {
  const where = data.scope.branches
    ? data.scope.branches.map((b) => b.name).join(', ')
    : r.wholeTenant(data.scope.tenantName);
  const applied = [
    data.applied.branch ? r.filterBranch(data.applied.branch.name) : null,
    data.applied.course ? r.filterCourse(data.applied.course.name) : null,
    data.applied.status ? r.filterStatus(t.status.compliance[data.applied.status]) : null,
  ].filter((part): part is string => part !== null);
  return (
    <p
      data-slot="scope-banner"
      aria-label={r.scopeLabel}
      role="note"
      className="rounded-lg border bg-muted px-4 py-3 text-sm"
    >
      <span className="font-medium">{r.scope(where)}</span>
      {' · '}
      {applied.length ? r.filters(applied.join(', ')) : r.noFilters}
      {' · '}
      {r.generated(formatDateTime(data.generatedAt, { timeZone: data.timeZone }))}
      {' · '}
      {r.rowsCount(data.totals.total)}
    </p>
  );
}

function Totals({ data }: { data: ComplianceReportData }) {
  return (
    <section aria-label={r.totalsLabel}>
      <ul className="flex flex-wrap gap-2">
        {STATUSES.map((status) => (
          <li
            key={status}
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
          >
            <StatusBadge entity="compliance" status={status} />
            <span className="font-semibold tabular-nums">{data.totals.byStatus[status]}</span>
          </li>
        ))}
      </ul>
    </section>
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
    <FormField label={label} className="md:w-52">
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
