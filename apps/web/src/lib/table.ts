import * as React from 'react';

/*
 * Server-driven table state (D-060: no client table engine). The API sorts, filters and paginates; the client only
 * keeps what to ask for next. Lists follow the API envelope `{ data, page: { nextCursor, limit } }` (CLAUDE.md).
 */

export type SortDirection = 'asc' | 'desc';
export type SortState = { field: string; direction: SortDirection } | null;

/** Clicking a column: a new column sorts ascending; the same column flips direction. */
export function nextSort(current: SortState, field: string): SortState {
  if (current?.field !== field) return { field, direction: 'asc' };
  return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

/** Value for `aria-sort` on a column header (`none` when another column is sorted). */
export function ariaSort(current: SortState, field: string): 'ascending' | 'descending' | 'none' {
  if (current?.field !== field) return 'none';
  return current.direction === 'asc' ? 'ascending' : 'descending';
}

export const PAGE_LIMITS = [25, 50, 100] as const;
export type PageLimit = (typeof PAGE_LIMITS)[number];
export const DEFAULT_PAGE_LIMIT: PageLimit = 25;

/**
 * Cursor pages cannot be addressed by number, so "Previous" needs the cursors already visited. `cursors[i]` is the
 * cursor that fetches page i (page 0 has none). The stack is in memory only: reloading starts from the first page.
 */
export type CursorStack = readonly (string | null)[];

export type CursorAction =
  { type: 'next'; cursor: string } | { type: 'previous' } | { type: 'reset' };

export const INITIAL_CURSORS: CursorStack = [null];

export function cursorReducer(stack: CursorStack, action: CursorAction): CursorStack {
  switch (action.type) {
    case 'next':
      return [...stack, action.cursor];
    case 'previous':
      return stack.length > 1 ? stack.slice(0, -1) : stack;
    case 'reset':
      return INITIAL_CURSORS;
  }
}

/** Cursor pagination state for one list. Call `reset()` whenever search, filters, sort or limit change. */
export function useCursorPagination() {
  const [stack, dispatch] = React.useReducer(cursorReducer, INITIAL_CURSORS);
  return {
    /** Send as `cursor` in the list request; `null` for the first page. */
    cursor: stack[stack.length - 1] ?? null,
    pageIndex: stack.length - 1,
    hasPrevious: stack.length > 1,
    goNext: React.useCallback((cursor: string) => dispatch({ type: 'next', cursor }), []),
    goPrevious: React.useCallback(() => dispatch({ type: 'previous' }), []),
    reset: React.useCallback(() => dispatch({ type: 'reset' }), []),
  };
}

/** `value` after it has stopped changing for `delayMs` — use for search text before sending it to the API. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
