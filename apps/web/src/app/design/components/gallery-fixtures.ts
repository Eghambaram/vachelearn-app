import type { SortState } from '@/lib/table';

/*
 * Gallery-only fixtures. Fictional, clearly not product data, and shown with the Demo badge. `listExampleLearners`
 * imitates the API list contract (`{ data, page: { nextCursor, limit } }`, server-side search/filter/sort) so the
 * DataTable is exercised the way real screens will use it.
 */

export type ExampleLearner = {
  id: string;
  name: string;
  branch: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'overdue';
  /** YYYY-MM-DD calendar date */
  dueOn: string;
  progress: number;
};

const STATUSES = ['not_started', 'in_progress', 'completed', 'overdue'] as const;
const BRANCHES = ['Example Branch A1', 'Example Branch A2', 'Example Head Office'] as const;

export const EXAMPLE_LEARNERS: readonly ExampleLearner[] = Array.from({ length: 37 }, (_, i) => {
  const n = i + 1;
  return {
    id: `learner-${n}`,
    name: `Example Learner ${String(n).padStart(2, '0')}`,
    branch: BRANCHES[n % BRANCHES.length]!,
    status: STATUSES[(n * 7) % STATUSES.length]!,
    dueOn: `2026-${String((n % 3) + 11).padStart(2, '0')}-${String(((n * 5) % 28) + 1).padStart(2, '0')}`,
    progress: (n * 17) % 101,
  };
});

export const SORT_FIELDS = ['name', 'dueOn', 'progress'] as const;

export type ExampleListQuery = {
  search: string;
  status: ExampleLearner['status'] | 'all';
  sort: SortState;
  cursor: string | null;
  limit: number;
};

export function listExampleLearners({ search, status, sort, cursor, limit }: ExampleListQuery) {
  const term = search.trim().toLowerCase();
  let rows = EXAMPLE_LEARNERS.filter(
    (row) =>
      (status === 'all' || row.status === status) &&
      (term === '' || row.name.toLowerCase().includes(term)),
  );
  if (sort && (SORT_FIELDS as readonly string[]).includes(sort.field)) {
    const field = sort.field as (typeof SORT_FIELDS)[number];
    const factor = sort.direction === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) =>
      a[field] < b[field] ? -factor : a[field] > b[field] ? factor : 0,
    );
  }
  const offset = cursor ? Number(cursor) : 0;
  const data = rows.slice(offset, offset + limit);
  const nextOffset = offset + limit;
  return {
    data,
    page: { nextCursor: nextOffset < rows.length ? String(nextOffset) : null, limit },
  };
}

export const EXAMPLE_COMPLETION_BY_BRANCH = [
  { branch: 'Example Branch A1', completed: 64, overdue: 9 },
  { branch: 'Example Branch A2', completed: 52, overdue: 15 },
  { branch: 'Example Head Office', completed: 81, overdue: 4 },
] as const;

export const EXAMPLE_MONTHLY_TREND = [
  { month: 'May', mandatory: 61, optional: 38 },
  { month: 'Jun', mandatory: 64, optional: 41 },
  { month: 'Jul', mandatory: 66, optional: 40 },
  { month: 'Aug', mandatory: 70, optional: 44 },
  { month: 'Sep', mandatory: 71, optional: 47 },
  { month: 'Oct', mandatory: 74, optional: 49 },
] as const;
