'use client';

import * as React from 'react';
import type { InvitationListPage, InvitationStatus, InvitationView } from '@vachelearn/contracts';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { FormField } from '@/components/form-field';
import { InlineAlert } from '@/components/inline-alert';
import { Pagination } from '@/components/pagination';
import { ReasonDialog } from '@/components/reason-dialog';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ApiResult } from '@/lib/api/client';
import { listInvitations, resendInvitation, revokeInvitation } from '@/lib/api/invitations';
import { formatDate } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import { DEFAULT_PAGE_LIMIT, useCursorPagination, type PageLimit } from '@/lib/table';
import { useApiAction } from '@/lib/use-api-action';
import { invitationErrorMessage } from './messages';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const i = t.invitations;

const ALL = 'all';
const STATUSES: readonly InvitationStatus[] = ['pending', 'expired', 'accepted', 'revoked'];

type Option = { id: string; label: string };
type Filters = { search: string; status: InvitationStatus | typeof ALL; branchId: string };
const NO_FILTERS: Filters = { search: '', status: ALL, branchId: ALL };

function whenText(row: InvitationView) {
  switch (row.status) {
    case 'accepted':
      return i.acceptedOn(formatDate(row.acceptedAt!));
    case 'revoked':
      return i.cancelledOn(formatDate(row.revokedAt!));
    case 'expired':
      return i.expiredOn(formatDate(row.expiresAt));
    default:
      return formatDate(row.expiresAt);
  }
}

/**
 * Invitations of the caller's organisation (Slice 3.1). The API applies tenant and branch scope and says per row
 * whether this caller may resend or cancel it (`canManage`: a Branch Admin only Learner/Instructor invitations on its
 * branches); only those rows offer the actions. After a change the list is read again from the API.
 */
export function InvitationList({
  initial,
  branches,
  justSent,
}: {
  initial: ApiResult<InvitationListPage>;
  /** Branches the caller can see; empty hides the filter. */
  branches: readonly Option[];
  /** The address an invitation was just sent to (from the invite page), shown once. */
  justSent: string | null;
}) {
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS);
  const [limit, setLimit] = React.useState<PageLimit>(DEFAULT_PAGE_LIMIT);
  const [result, setResult] = React.useState(initial);
  const [loading, startTransition] = React.useTransition();
  const pager = useCursorPagination();
  const searchTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const { run, pending, error, done, statusRef, onCloseAutoFocus } =
    useApiAction(invitationErrorMessage);

  function load(next: { filters?: Filters; limit?: PageLimit; cursor?: string | null }) {
    const f = next.filters ?? filters;
    const query = {
      search: f.search.trim() || undefined,
      status: f.status === ALL ? undefined : f.status,
      branchId: f.branchId === ALL ? undefined : f.branchId,
      limit: next.limit ?? limit,
      cursor: next.cursor ?? undefined,
    };
    startTransition(async () => setResult(await listInvitations(query)));
  }

  function changeFilters(next: Filters, { debounce = false } = {}) {
    setFilters(next);
    pager.reset();
    clearTimeout(searchTimer.current);
    if (debounce)
      searchTimer.current = setTimeout(() => load({ filters: next, cursor: null }), 300);
    else load({ filters: next, cursor: null });
  }

  // After a change, read the current page again (never a local guess at the new state).
  const reload = () => load({ cursor: pager.cursor });

  const columns: DataTableColumn<InvitationView>[] = [
    {
      id: 'email',
      header: i.columns.email,
      className: 'whitespace-normal min-w-56',
      cell: (row) => <span className="font-medium break-all">{row.email}</span>,
    },
    {
      id: 'role',
      header: i.columns.role,
      className: 'whitespace-normal',
      cell: (row) => (
        <span className="flex flex-col gap-0.5">
          <span>{t.roles[row.role]}</span>
          <span className="text-xs text-muted-foreground">
            {row.branch ? row.branch.name : i.wholeOrganisation}
          </span>
        </span>
      ),
    },
    {
      id: 'status',
      header: i.columns.status,
      cell: (row) => <StatusBadge entity="invitation" status={row.status} />,
    },
    {
      id: 'expires',
      header: i.columns.expires,
      cell: (row) => <span>{whenText(row)}</span>,
    },
    {
      id: 'invitedBy',
      header: i.columns.invitedBy,
      cell: (row) => row.invitedBy?.displayName ?? i.unknownInviter,
    },
    {
      id: 'actions',
      header: i.columns.actions,
      cell: (row) =>
        row.canManage ? (
          <span className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-disabled={pending || undefined}
              onClick={async () => {
                if (!(await run((csrf) => resendInvitation(row.id, csrf), i.resent(row.email))))
                  reload();
              }}
            >
              {i.resend}
              <span className="sr-only"> {i.resendContext(row.email)}</span>
            </Button>
            <ReasonDialog
              trigger={
                <Button type="button" size="sm" variant="outline">
                  {i.cancel}
                  <span className="sr-only"> {i.resendContext(row.email)}</span>
                </Button>
              }
              title={i.cancelTitle(row.email)}
              impact={i.cancelImpact}
              confirmLabel={i.cancelConfirm}
              reasonLabel={i.reason}
              reasonHelp={i.reasonHelp}
              reasonError={i.reasonError}
              destructive
              onCloseAutoFocus={onCloseAutoFocus}
              onConfirm={async (reason) => {
                const failure = await run(
                  (csrf) => revokeInvitation(row.id, reason, csrf),
                  i.cancelled,
                  { from: 'reason-dialog' },
                );
                if (!failure) reload();
                return failure?.message ?? null;
              }}
            />
          </span>
        ) : null,
    },
  ];

  const rows = result.ok ? result.data.data : [];
  const nextCursor = result.ok ? result.data.page.nextCursor : null;
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const activeCount = (['status', 'branchId'] as const).filter((k) => filters[k] !== ALL).length;
  const message = error ?? done ?? (justSent ? i.sent(justSent) : null);

  return (
    <div className="flex flex-col gap-4">
      {message ? (
        <InlineAlert ref={statusRef} tone={error ? 'danger' : 'success'}>
          {message}
        </InlineAlert>
      ) : null}
      <DataTable<InvitationView>
        caption={i.caption}
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        getRowLabel={(row) => row.email}
        status={loading ? 'loading' : result.ok ? 'ready' : 'error'}
        error={
          !result.ok
            ? { requestId: result.error.requestId, onRetry: () => load({ cursor: pager.cursor }) }
            : undefined
        }
        empty={
          filtered
            ? { title: i.noMatchTitle, description: i.noMatchDescription }
            : { title: i.emptyTitle, description: i.emptyDescription }
        }
        toolbar={
          <FilterBar
            search={{
              value: filters.search,
              onChange: (search) => changeFilters({ ...filters, search }, { debounce: true }),
              label: i.searchLabel,
              placeholder: i.searchPlaceholder,
            }}
            activeCount={activeCount}
            onClear={() => changeFilters(NO_FILTERS)}
          >
            <FilterSelect
              label={i.status}
              value={filters.status}
              allLabel={i.allStatuses}
              options={STATUSES.map((value) => ({ id: value, label: t.status.invitation[value] }))}
              onChange={(status) =>
                changeFilters({ ...filters, status: status as Filters['status'] })
              }
            />
            {branches.length > 0 ? (
              <FilterSelect
                label={i.branch}
                value={filters.branchId}
                allLabel={i.allBranches}
                options={branches}
                onChange={(branchId) => changeFilters({ ...filters, branchId })}
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
            disabled={loading}
          />
        }
      />
    </div>
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
