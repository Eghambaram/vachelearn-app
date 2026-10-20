import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCursorPagination } from '@/lib/table';
import { DataTable, type DataTableColumn } from './data-table';
import { Pagination } from './pagination';

type Learner = { id: string; name: string; branch: string };

const ROWS: Learner[] = [
  { id: 'u1', name: 'Learner One', branch: 'Branch A1' },
  { id: 'u2', name: 'Learner Two', branch: 'Branch A2' },
];

const COLUMNS: DataTableColumn<Learner>[] = [
  { id: 'name', header: 'Name', cell: (row) => row.name, sortField: 'name' },
  { id: 'branch', header: 'Branch', cell: (row) => row.branch },
];

function renderTable(props: Partial<React.ComponentProps<typeof DataTable<Learner>>> = {}) {
  render(
    <DataTable<Learner>
      caption="Learners"
      columns={COLUMNS}
      rows={ROWS}
      getRowId={(row) => row.id}
      getRowLabel={(row) => row.name}
      empty={{ title: 'No learners yet' }}
      {...props}
    />,
  );
  return userEvent.setup({ delay: null });
}

describe('DataTable sorting', () => {
  it('asks for an ascending sort on first click and exposes the order with aria-sort', async () => {
    const onSortChange = vi.fn();
    const user = renderTable({ onSortChange });
    const header = screen.getByRole('columnheader', { name: 'Name' });
    expect(header).toHaveAttribute('aria-sort', 'none');
    await user.click(within(header).getByRole('button', { name: 'Name' }));
    expect(onSortChange).toHaveBeenCalledWith({ field: 'name', direction: 'asc' });
  });

  it('flips to descending when the sorted column is clicked again', async () => {
    const onSortChange = vi.fn();
    const user = renderTable({ onSortChange, sort: { field: 'name', direction: 'asc' } });
    const header = screen.getByRole('columnheader', { name: 'Name' });
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    await user.click(within(header).getByRole('button'));
    expect(onSortChange).toHaveBeenCalledWith({ field: 'name', direction: 'desc' });
  });

  it('renders rows in the order the server returned, without sorting locally', () => {
    renderTable({ sort: { field: 'name', direction: 'desc' }, onSortChange: vi.fn() });
    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent);
    expect(names).toEqual(['Learner OneBranch A1', 'Learner TwoBranch A2']);
  });

  it('does not offer sorting on columns without a server sort field', () => {
    renderTable({ onSortChange: vi.fn() });
    const header = screen.getByRole('columnheader', { name: 'Branch' });
    expect(header).not.toHaveAttribute('aria-sort');
    expect(within(header).queryByRole('button')).toBeNull();
  });
});

describe('DataTable states', () => {
  it('shows the empty state instead of an empty table', () => {
    renderTable({ rows: [], empty: { title: 'No learners yet', description: 'Invite people.' } });
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('heading', { name: 'No learners yet' })).toBeInTheDocument();
  });

  it('keeps the header and marks the table busy while loading', () => {
    renderTable({ status: 'loading', rows: [] });
    expect(screen.getByRole('table', { name: 'Learners' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Loading rows…');
  });

  it('shows a retryable error with the request reference', async () => {
    const onRetry = vi.fn();
    const user = renderTable({ status: 'error', error: { requestId: 'req_123', onRetry } });
    expect(screen.getByRole('alert')).toHaveTextContent('req_123');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('DataTable selection and actions', () => {
  function SelectableTable() {
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    return (
      <DataTable<Learner>
        caption="Learners"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(row) => row.id}
        getRowLabel={(row) => row.name}
        empty={{ title: 'None' }}
        selection={{ selected, onChange: setSelected }}
        bulkActions={(ids) => <button type="button">Send reminder to {ids.length}</button>}
      />
    );
  }

  it('selects all rows on the page and shows bulk actions with a count', async () => {
    render(<SelectableTable />);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('checkbox', { name: 'Select Learner One' }));
    expect(screen.getByRole('checkbox', { name: 'Select all rows on this page' })).toHaveAttribute(
      'aria-checked',
      'mixed',
    );
    await user.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send reminder to 2' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByText('2 selected')).toBeNull();
  });

  it('names each row action menu after its row and runs the chosen action', async () => {
    const onSelect = vi.fn();
    const user = renderTable({ rowActions: () => [{ label: 'View details', onSelect }] });
    await user.click(screen.getByRole('button', { name: 'Actions for Learner Two' }));
    await user.click(await screen.findByRole('menuitem', { name: 'View details' }));
    expect(onSelect).toHaveBeenCalledWith(ROWS[1]);
  });
});

describe('Pagination with cursors', () => {
  function PagedList({ nextCursors }: { nextCursors: (string | null)[] }) {
    const pager = useCursorPagination();
    const nextCursor = nextCursors[pager.pageIndex] ?? null;
    return (
      <>
        <output>cursor={String(pager.cursor)}</output>
        <Pagination
          pageIndex={pager.pageIndex}
          hasPrevious={pager.hasPrevious}
          hasNext={nextCursor !== null}
          onPrevious={pager.goPrevious}
          onNext={() => nextCursor && pager.goNext(nextCursor)}
        />
      </>
    );
  }

  it('requests the next cursor, then returns to the previous page', async () => {
    render(<PagedList nextCursors={['c2', 'c3', null]} />);
    const user = userEvent.setup({ delay: null });
    const previous = screen.getByRole('button', { name: 'Previous page' });
    const next = screen.getByRole('button', { name: 'Next page' });
    expect(previous).toBeDisabled();
    expect(screen.getByText('cursor=null')).toBeInTheDocument();

    await user.click(next);
    await user.click(next);
    expect(screen.getByText('cursor=c3')).toBeInTheDocument();
    expect(screen.getByText('Page 3')).toBeInTheDocument();
    expect(next).toBeDisabled();

    await user.click(previous);
    expect(screen.getByText('cursor=c2')).toBeInTheDocument();
    expect(screen.getByText('Page 2')).toBeInTheDocument();
  });
});
