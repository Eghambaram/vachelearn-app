'use client';

import * as React from 'react';
import type {
  GroupMemberListPage,
  GroupMemberView,
  GroupView,
  PersonSummary,
} from '@vachelearn/contracts';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { FilterBar } from '@/components/filter-bar';
import { FormField } from '@/components/form-field';
import { InlineAlert } from '@/components/inline-alert';
import { Pagination } from '@/components/pagination';
import { ReasonDialog } from '@/components/reason-dialog';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ApiResult } from '@/lib/api/client';
import { addGroupMembers, listGroupMembers, removeGroupMember } from '@/lib/api/groups';
import { listPeople } from '@/lib/api/people';
import { formatDate } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import { DEFAULT_PAGE_LIMIT, useCursorPagination, type PageLimit } from '@/lib/table';
import { useApiAction } from '@/lib/use-api-action';
import { groupErrorMessage } from './messages';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const m = t.groups.members;

type Show = 'current' | 'removed';

/**
 * Members of one group (Slice 3.2, D-120): current members, or the removed ones with when and why (history is never
 * deleted). Managers add active people — for a branch group only people of that branch, which the API enforces — and
 * remove members with a reason. Every change re-reads the list from the API.
 */
export function GroupMembers({
  group,
  initial,
  canSearchPeople,
}: {
  group: GroupView;
  initial: ApiResult<GroupMemberListPage>;
  /** The caller may list people (`user.read`), needed to find someone to add. */
  canSearchPeople: boolean;
}) {
  const [show, setShow] = React.useState<Show>('current');
  const [search, setSearch] = React.useState('');
  const [limit, setLimit] = React.useState<PageLimit>(DEFAULT_PAGE_LIMIT);
  const [result, setResult] = React.useState(initial);
  const [loading, startTransition] = React.useTransition();
  const pager = useCursorPagination();
  const searchTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const { run, pending, error, done, statusRef, onCloseAutoFocus } =
    useApiAction(groupErrorMessage);
  const manage = group.canManage;

  function load(next: { show?: Show; search?: string; limit?: PageLimit; cursor?: string | null }) {
    const query = {
      state: next.show ?? show,
      search: (next.search ?? search).trim() || undefined,
      limit: next.limit ?? limit,
      cursor: next.cursor ?? undefined,
    };
    startTransition(async () => setResult(await listGroupMembers(group.id, query)));
  }
  const reload = () => load({ cursor: pager.cursor });

  const nameCell: DataTableColumn<GroupMemberView> = {
    id: 'name',
    header: m.columns.name,
    className: 'whitespace-normal min-w-40',
    cell: (row) => <span className="font-medium">{row.displayName}</span>,
  };
  const emailCell: DataTableColumn<GroupMemberView> = {
    id: 'email',
    header: m.columns.email,
    className: 'whitespace-normal',
    cell: (row) => <span className="break-all">{row.email}</span>,
  };
  const current: DataTableColumn<GroupMemberView>[] = [
    nameCell,
    emailCell,
    {
      id: 'status',
      header: m.columns.status,
      cell: (row) => <StatusBadge entity="member" status={row.memberStatus} />,
    },
    { id: 'added', header: m.columns.added, cell: (row) => formatDate(row.addedAt) },
    ...(manage
      ? [
          {
            id: 'actions',
            header: m.columns.actions,
            cell: (row: GroupMemberView) =>
              row.canRemove ? (
                <ReasonDialog
                  trigger={
                    <Button type="button" size="sm" variant="outline">
                      {m.remove} <span className="sr-only">{row.displayName}</span>
                    </Button>
                  }
                  title={m.removeTitle(row.displayName)}
                  impact={m.removeImpact}
                  confirmLabel={m.remove}
                  reasonLabel={t.groups.reason}
                  reasonHelp={t.groups.reasonHelp}
                  reasonError={t.groups.reasonError}
                  destructive
                  onCloseAutoFocus={onCloseAutoFocus}
                  onConfirm={async (reason) => {
                    const failure = await run(
                      (csrf) => removeGroupMember(group.id, row.id, reason, csrf),
                      m.removed_,
                      { from: 'reason-dialog' },
                    );
                    if (!failure) reload();
                    return failure?.message ?? null;
                  }}
                />
              ) : null,
          } satisfies DataTableColumn<GroupMemberView>,
        ]
      : []),
  ];
  const removed: DataTableColumn<GroupMemberView>[] = [
    nameCell,
    emailCell,
    { id: 'added', header: m.columns.added, cell: (row) => formatDate(row.addedAt) },
    {
      id: 'removed',
      header: m.columns.removed,
      cell: (row) => (row.removedAt ? formatDate(row.removedAt) : null),
    },
    {
      id: 'reason',
      header: m.columns.reason,
      className: 'whitespace-normal min-w-40',
      cell: (row) => <span className="break-words">{row.removedReason}</span>,
    },
  ];

  const rows = result.ok ? result.data.data : [];
  const nextCursor = result.ok ? result.data.page.nextCursor : null;
  const filtered = search.trim() !== '';
  const canAdd = manage && group.status === 'active' && canSearchPeople;

  return (
    <section
      aria-labelledby="group-members"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
    >
      <h2 id="group-members" className="text-lg font-semibold">
        {m.title}
      </h2>
      {error || done ? (
        <InlineAlert ref={statusRef} tone={error ? 'danger' : 'success'}>
          {error ?? done}
        </InlineAlert>
      ) : null}
      {manage && group.status !== 'active' ? (
        <p className="text-sm text-muted-foreground">{m.archivedNote}</p>
      ) : null}
      {manage && group.status === 'active' && !canSearchPeople ? (
        <p className="text-sm text-muted-foreground">{m.cannotList}</p>
      ) : null}
      {canAdd ? (
        <AddPeople
          group={group}
          pending={pending}
          onAdd={async (person) => {
            const failure = await run(
              (csrf) => addGroupMembers(group.id, [person.membershipId], csrf),
              m.added(person.displayName),
            );
            if (!failure && show === 'current') reload();
          }}
        />
      ) : null}
      <DataTable<GroupMemberView>
        caption={show === 'current' ? m.caption : m.historyCaption}
        columns={show === 'current' ? current : removed}
        rows={rows}
        getRowId={(row) => row.id}
        getRowLabel={(row) => row.displayName}
        status={loading ? 'loading' : result.ok ? 'ready' : 'error'}
        error={
          !result.ok
            ? { requestId: result.error.requestId, onRetry: () => load({ cursor: pager.cursor }) }
            : undefined
        }
        empty={
          filtered
            ? { title: m.noMatchTitle, description: m.noMatchDescription }
            : show === 'removed'
              ? { title: m.historyEmptyTitle, description: m.historyEmptyDescription }
              : {
                  title: m.emptyTitle,
                  description: canAdd ? m.emptyDescription : m.emptyReadOnly,
                }
        }
        toolbar={
          <FilterBar
            search={{
              value: search,
              onChange: (value) => {
                setSearch(value);
                pager.reset();
                clearTimeout(searchTimer.current);
                searchTimer.current = setTimeout(() => load({ search: value, cursor: null }), 300);
              },
              label: m.searchLabel,
              placeholder: m.searchPlaceholder,
            }}
            activeCount={show === 'current' ? 0 : 1}
            onClear={() => {
              setSearch('');
              setShow('current');
              pager.reset();
              load({ search: '', show: 'current', cursor: null });
            }}
          >
            <FormField label={t.groups.status} className="md:w-48">
              {(field) => (
                <Select
                  value={show}
                  onValueChange={(value) => {
                    setShow(value as Show);
                    pager.reset();
                    load({ show: value as Show, cursor: null });
                  }}
                >
                  <SelectTrigger {...field} className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">{m.current}</SelectItem>
                    <SelectItem value="removed">{m.removed}</SelectItem>
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
            disabled={loading}
          />
        }
      />
    </section>
  );
}

/** Find an active person the caller can see (in the group's branch, for a branch group) and add them. */
function AddPeople({
  group,
  pending,
  onAdd,
}: {
  group: GroupView;
  pending: boolean;
  onAdd: (person: PersonSummary) => Promise<void>;
}) {
  const [query, setQuery] = React.useState('');
  const [found, setFound] = React.useState<ApiResult<{ data: PersonSummary[] }> | null>(null);
  const [searching, startTransition] = React.useTransition();
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  function find(text: string) {
    clearTimeout(timer.current);
    if (text.trim().length < 2) {
      setFound(null);
      return;
    }
    timer.current = setTimeout(
      () =>
        startTransition(async () =>
          setFound(
            await listPeople({
              search: text.trim(),
              status: 'active',
              branchId: group.branch?.id,
              limit: 10,
            }),
          ),
        ),
      300,
    );
  }

  const people = found?.ok ? found.data.data : [];
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
      <h3 className="font-medium">{m.addTitle}</h3>
      <p className="text-sm text-muted-foreground">
        {group.branch ? m.addHelpBranch(group.branch.name) : m.addHelpTenant}
      </p>
      <FormField label={m.findLabel} help={m.findPrompt} className="max-w-md">
        {(field) => (
          <Input
            {...field}
            type="search"
            value={query}
            placeholder={m.findPlaceholder}
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value);
              find(event.target.value);
            }}
          />
        )}
      </FormField>
      <div aria-live="polite" aria-busy={searching || undefined}>
        {found && !found.ok ? (
          <InlineAlert tone="danger">{groupErrorMessage(found)}</InlineAlert>
        ) : found && people.length === 0 && !searching ? (
          <p className="text-sm text-muted-foreground">{m.findEmpty}</p>
        ) : people.length > 0 ? (
          <ul aria-label={m.findCaption} className="flex flex-col divide-y rounded-lg border">
            {people.map((person) => (
              <li
                key={person.membershipId}
                className="flex flex-wrap items-center justify-between gap-2 p-3"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{person.displayName}</span>
                  <span className="text-sm break-all text-muted-foreground">{person.email}</span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-disabled={pending || undefined}
                  onClick={() => void onAdd(person)}
                >
                  {m.addOne} <span className="sr-only">{person.displayName}</span>
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
