'use client';

import * as React from 'react';
import type { AuditEventListPage, AuditEventView } from '@vachelearn/contracts';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { FormField } from '@/components/form-field';
import { Pagination } from '@/components/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listAuditEvents } from '@/lib/api/audit';
import type { ApiResult } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import { DEFAULT_PAGE_LIMIT, useCursorPagination, type PageLimit } from '@/lib/table';
import { FILTER_ACTIONS, changes, reasonLine, record, who } from './present';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const a = t.auditLog;

const ALL = 'all';

const COLUMNS: DataTableColumn<AuditEventView>[] = [
  {
    id: 'when',
    header: a.columns.when,
    cell: (row) => <time dateTime={row.occurredAt}>{formatDateTime(row.occurredAt)}</time>,
  },
  {
    id: 'who',
    header: a.columns.who,
    className: 'whitespace-normal min-w-40',
    cell: (row) => (
      <div className="flex flex-col gap-0.5">
        <span className="font-medium break-words">{who(row)}</span>
        {/* The support reason once, on the row that opened the session (UX review 2.6a). */}
        {row.actor.kind === 'support' &&
        row.actor.reason &&
        row.action === 'support_session.started' ? (
          <span className="text-xs break-words text-muted-foreground">
            {a.supportReason(row.actor.reason)}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    id: 'what',
    header: a.columns.what,
    className: 'whitespace-normal min-w-48',
    cell: (row) => (
      <div className="flex flex-col gap-0.5">
        <span>{a.actions[row.action] ?? row.action}</span>
        <span className="text-xs break-words text-muted-foreground">
          {record(row)}
          {row.branch ? ` · ${a.branch(row.branch.name)}` : ''}
        </span>
      </div>
    ),
  },
  {
    id: 'details',
    header: a.columns.details,
    className: 'whitespace-normal min-w-56',
    cell: (row) => {
      const lines = changes(row);
      // The started row shows the reason under "Who" already.
      const reason = row.action === 'support_session.started' ? null : reasonLine(row);
      return (
        <div className="flex flex-col gap-1 text-sm">
          {reason ? <span className="break-words">{reason}</span> : null}
          {lines.length > 0 ? (
            <details>
              <summary className="inline-flex min-h-6 cursor-pointer items-center text-primary">
                {a.changes}
                <span className="sr-only">
                  {' '}
                  {a.changesContext(a.actions[row.action] ?? row.action)}
                </span>
              </summary>
              <ul className="mt-1 flex flex-col gap-0.5 text-xs break-words text-muted-foreground">
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      );
    },
  },
];

type Filters = { action: string; support: string };
const NO_FILTERS: Filters = { action: ALL, support: ALL };

/**
 * The tenant audit log (Slice 2.6a; D-099, D-109): newest first, server-driven paging and filters; the API scopes it
 * (branch-scoped readers see their branches' events). Read-only — entries are never changed or deleted.
 */
export function AuditLog({ initial }: { initial: ApiResult<AuditEventListPage> }) {
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS);
  const [limit, setLimit] = React.useState<PageLimit>(DEFAULT_PAGE_LIMIT);
  const [result, setResult] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();
  const pager = useCursorPagination();

  function load(next: { filters?: Filters; limit?: PageLimit; cursor?: string | null }) {
    const f = next.filters ?? filters;
    startTransition(async () =>
      setResult(
        await listAuditEvents({
          action: f.action === ALL ? undefined : f.action,
          support: f.support === ALL ? undefined : 'true',
          limit: next.limit ?? limit,
          cursor: next.cursor ?? undefined,
        }),
      ),
    );
  }

  function changeFilters(next: Filters) {
    setFilters(next);
    pager.reset();
    load({ filters: next, cursor: null });
  }

  const rows = result.ok ? result.data.data : [];
  const nextCursor = result.ok ? result.data.page.nextCursor : null;
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  return (
    <DataTable<AuditEventView>
      caption={a.caption}
      columns={COLUMNS}
      rows={rows}
      getRowId={(row) => row.id}
      getRowLabel={(row) => a.actions[row.action] ?? row.action}
      status={pending ? 'loading' : result.ok ? 'ready' : 'error'}
      error={
        !result.ok
          ? { requestId: result.error.requestId, onRetry: () => load({ cursor: pager.cursor }) }
          : undefined
      }
      empty={
        filtered
          ? { title: a.noMatchTitle, description: a.noMatchDescription }
          : { title: a.emptyTitle, description: a.emptyDescription }
      }
      toolbar={
        <FilterBar
          activeCount={(['action', 'support'] as const).filter((k) => filters[k] !== ALL).length}
          onClear={() => changeFilters(NO_FILTERS)}
        >
          <FormField label={a.action} className="md:w-72">
            {(field) => (
              <Select
                value={filters.action}
                onValueChange={(action) => changeFilters({ ...filters, action })}
              >
                <SelectTrigger {...field} className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{a.allActions}</SelectItem>
                  {FILTER_ACTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {a.actions[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField label={a.source} className="md:w-60">
            {(field) => (
              <Select
                value={filters.support}
                onValueChange={(support) => changeFilters({ ...filters, support })}
              >
                <SelectTrigger {...field} className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{a.allSources}</SelectItem>
                  <SelectItem value="support">{a.supportOnly}</SelectItem>
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
