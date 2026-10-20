'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { IconButton } from '@/components/icon-button';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ariaSort, nextSort, type SortState } from '@/lib/table';
import { cn } from '@/lib/utils';
import { en } from '@/messages/en';

export type DataTableColumn<Row> = {
  id: string;
  header: string;
  cell: (row: Row) => React.ReactNode;
  /** The API's allowlisted sort field for this column. Omit for columns the server cannot sort. */
  sortField?: string;
  align?: 'start' | 'end';
  className?: string;
};

export type RowAction<Row> = {
  label: string;
  onSelect: (row: Row) => void;
  icon?: React.ReactNode;
  /** Styled as destructive. The handler must open a ConfirmDialog that states the impact before acting. */
  destructive?: boolean;
};

type DataTableProps<Row> = {
  /** Names the table for assistive technology (rendered as a visually hidden caption). */
  caption: string;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  getRowId: (row: Row) => string;
  /** Human name of a row, used in "Actions for …" and "Select …" labels. */
  getRowLabel: (row: Row) => string;
  /** `loading` keeps the header and shows placeholder rows; `error` replaces the body. */
  status?: 'ready' | 'loading' | 'error';
  error?: { requestId?: string; onRetry?: () => void };
  sort?: SortState;
  /** Called with the new sort; the caller refetches page 1 from the API with it. */
  onSortChange?: (sort: SortState) => void;
  /** Actions the viewer is permitted to take on this row (the API re-checks every one). */
  rowActions?: (row: Row) => readonly RowAction<Row>[];
  /** Enables row checkboxes. Selection covers the current page only; clear it when the page changes. */
  selection?: { selected: ReadonlySet<string>; onChange: (selected: Set<string>) => void };
  /** Bulk action buttons shown while rows are selected. */
  bulkActions?: (selectedIds: string[]) => React.ReactNode;
  empty: { title: string; description?: React.ReactNode; action?: React.ReactNode };
  /** Usually a FilterBar. */
  toolbar?: React.ReactNode;
  /** Usually a Pagination. */
  footer?: React.ReactNode;
  className?: string;
};

const LOADING_ROWS = 5;

/**
 * Server-driven list table (D-060): the API sorts, filters and paginates; this renders one page and reports what the
 * viewer asked for. It never sorts or filters rows locally, so what is shown always matches what the server allowed.
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  getRowId,
  getRowLabel,
  status = 'ready',
  error,
  sort = null,
  onSortChange,
  rowActions,
  selection,
  bulkActions,
  empty,
  toolbar,
  footer,
  className,
}: DataTableProps<Row>) {
  const loading = status === 'loading';
  const pageIds = rows.map(getRowId);
  const selectedOnPage = selection ? pageIds.filter((id) => selection.selected.has(id)) : [];
  const allSelected = pageIds.length > 0 && selectedOnPage.length === pageIds.length;
  const someSelected = selectedOnPage.length > 0 && !allSelected;
  const columnCount = columns.length + (selection ? 1 : 0) + (rowActions ? 1 : 0);

  function toggleAll(checked: boolean) {
    if (!selection) return;
    const next = new Set(selection.selected);
    for (const id of pageIds) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    selection.onChange(next);
  }

  function toggleRow(id: string, checked: boolean) {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (checked) next.add(id);
    else next.delete(id);
    selection.onChange(next);
  }

  let body: React.ReactNode;
  if (status === 'error') {
    body = <ErrorState headingLevel="h3" requestId={error?.requestId} onRetry={error?.onRetry} />;
  } else if (!loading && rows.length === 0) {
    body = (
      <EmptyState
        headingLevel="h3"
        title={empty.title}
        description={empty.description}
        action={empty.action}
      />
    );
  } else {
    body = (
      <Table aria-busy={loading || undefined}>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            {selection ? (
              <TableHead scope="col" className="w-10">
                <Checkbox
                  aria-label={en.table.selectAll}
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  disabled={loading || rows.length === 0}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                />
              </TableHead>
            ) : null}
            {columns.map((column) => (
              <TableHead
                key={column.id}
                scope="col"
                aria-sort={column.sortField ? ariaSort(sort, column.sortField) : undefined}
                className={cn(column.align === 'end' && 'text-right', column.className)}
              >
                {column.sortField && onSortChange ? (
                  <SortButton
                    label={column.header}
                    state={ariaSort(sort, column.sortField)}
                    align={column.align}
                    onClick={() => onSortChange(nextSort(sort, column.sortField!))}
                  />
                ) : (
                  column.header
                )}
              </TableHead>
            ))}
            {rowActions ? (
              <TableHead scope="col" className="w-12">
                <span className="sr-only">{en.table.actionsColumn}</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: LOADING_ROWS }, (_, index) => (
                <TableRow key={index} aria-hidden="true">
                  {Array.from({ length: columnCount }, (_, cell) => (
                    <TableCell key={cell}>
                      <Skeleton className="h-4 w-full max-w-40" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : rows.map((row) => {
                const id = getRowId(row);
                const label = getRowLabel(row);
                const selected = selection?.selected.has(id) ?? false;
                const actions = rowActions?.(row) ?? [];
                // The action menu is non-modal: menus are not dialogs (APG), and a modal menu aria-hides the page
                // while it stays focusable (axe aria-hidden-focus). Tab or Escape closes it.
                return (
                  <TableRow key={id} data-state={selected ? 'selected' : undefined}>
                    {selection ? (
                      <TableCell>
                        <Checkbox
                          aria-label={en.table.selectRow(label)}
                          checked={selected}
                          onCheckedChange={(checked) => toggleRow(id, checked === true)}
                        />
                      </TableCell>
                    ) : null}
                    {columns.map((column) => (
                      <TableCell
                        key={column.id}
                        className={cn(
                          column.align === 'end' && 'text-right tabular-nums',
                          column.className,
                        )}
                      >
                        {column.cell(row)}
                      </TableCell>
                    ))}
                    {rowActions ? (
                      <TableCell className="text-right">
                        {actions.length > 0 ? (
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <IconButton
                                label={en.table.rowActions(label)}
                                icon={<MoreHorizontal />}
                                size="icon-sm"
                              />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {actions.map((action) => (
                                <DropdownMenuItem
                                  key={action.label}
                                  variant={action.destructive ? 'destructive' : 'default'}
                                  onSelect={() => action.onSelect(row)}
                                >
                                  {action.icon ? (
                                    <span aria-hidden="true" className="contents">
                                      {action.icon}
                                    </span>
                                  ) : null}
                                  {action.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
        </TableBody>
      </Table>
    );
  }

  return (
    <div data-slot="data-table" className={cn('flex flex-col gap-4', className)}>
      {toolbar}
      {selection ? (
        <div
          aria-live="polite"
          className={cn(
            'flex flex-wrap items-center gap-3 rounded-lg bg-info-subtle px-3 py-2 text-sm',
            selectedOnPage.length === 0 && 'sr-only',
          )}
        >
          {selectedOnPage.length > 0 ? (
            <>
              <span className="font-medium text-info">
                {en.table.selected(selectedOnPage.length)}
              </span>
              {bulkActions?.(selectedOnPage)}
              <Button variant="ghost" size="sm" onClick={() => toggleAll(false)}>
                {en.table.clearSelection}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      <span role="status" className="sr-only">
        {loading ? en.table.loadingRows : ''}
      </span>
      <div className="rounded-xl border bg-card">{body}</div>
      {footer}
    </div>
  );
}

function SortButton({
  label,
  state,
  align,
  onClick,
}: {
  label: string;
  state: ReturnType<typeof ariaSort>;
  align?: 'start' | 'end';
  onClick: () => void;
}) {
  const Icon = state === 'ascending' ? ArrowUp : state === 'descending' ? ArrowDown : ArrowUpDown;
  return (
    // The header cell's aria-sort announces the current order; the button name stays the column name.
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mx-1.5 inline-flex h-8 items-center gap-1 rounded-md px-1.5 font-semibold hover:bg-accent hover:text-foreground',
        state !== 'none' && 'text-foreground',
        align === 'end' && 'flex-row-reverse',
      )}
    >
      {label}
      <Icon aria-hidden="true" className={cn('size-3.5', state === 'none' && 'opacity-60')} />
    </button>
  );
}
