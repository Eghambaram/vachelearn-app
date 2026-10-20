import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChartCard } from './chart-card';
import { KpiCard } from './kpi-card';
import { PermissionDenied } from './permission-denied';
import { Stepper, stepState } from './stepper';

describe('KpiCard', () => {
  it('is a named group whose change is described in words, not colour alone', () => {
    render(
      <KpiCard
        label="Overdue assignments"
        value="18"
        change={{ direction: 'up', value: '4', sentiment: 'negative', period: 'vs last week' }}
      />,
    );
    const card = screen.getByRole('group', { name: 'Overdue assignments' });
    expect(card).toHaveTextContent('18');
    expect(card).toHaveTextContent('Up4vs last week');
    expect(card.querySelector('[data-sentiment="negative"]')).not.toBeNull();
  });

  it('labels demo figures and hides the value while loading', () => {
    const { rerender } = render(<KpiCard label="Active learners" value="1,204" demo />);
    expect(screen.getByText('Demo')).toBeInTheDocument();
    rerender(<KpiCard label="Active learners" value="1,204" loading />);
    const card = screen.getByRole('group', { name: 'Active learners' });
    expect(card).toHaveAttribute('aria-busy', 'true');
    expect(card).not.toHaveTextContent('1,204');
  });
});

describe('Stepper', () => {
  const steps = [
    { id: 'details', label: 'Details' },
    { id: 'content', label: 'Content' },
    { id: 'publish', label: 'Publish' },
  ];

  it('derives complete / current / upcoming from the current index unless a step overrides it', () => {
    expect(steps.map((step, i) => stepState(step, i, 1))).toEqual([
      'complete',
      'current',
      'upcoming',
    ]);
    expect(stepState({ id: 'x', label: 'X', state: 'error' }, 0, 2)).toBe('error');
  });

  it('marks the current step and states each step in text', () => {
    render(<Stepper steps={steps} currentIndex={1} aria-label="Course builder progress" />);
    const group = screen.getByRole('group', { name: 'Course builder progress' });
    expect(group).toHaveTextContent('Step 2 of 3');
    const items = within(group).getAllByRole('listitem');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).toHaveTextContent('Details (completed)');
    expect(items[2]).toHaveTextContent('Publish (not started)');
  });
});

describe('ChartCard', () => {
  const table = {
    columns: [
      { key: 'month', label: 'Month' },
      { key: 'completed', label: 'Completed', numeric: true },
    ],
    rows: [
      { month: 'May', completed: '61%' },
      { month: 'June', completed: '74%' },
    ],
  };

  it('offers the same data as a table and always shows the text summary', async () => {
    render(
      <ChartCard title="Completion rate" summary="Completion rose from 61% to 74%." table={table}>
        <div data-testid="chart" />
      </ChartCard>,
    );
    expect(screen.getByText('Completion rose from 61% to 74%.')).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: 'Completion rate' })).toHaveAccessibleDescription(
      /Completion rose from 61% to 74%/,
    );
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('tab', { name: 'Table' }));
    const dataTable = screen.getByRole('table', { name: 'Completion rate' });
    expect(within(dataTable).getByRole('rowheader', { name: 'June' })).toBeInTheDocument();
    expect(within(dataTable).getByRole('cell', { name: '74%' })).toBeInTheDocument();
  });

  it('shows an empty state, not an empty chart, when there is no data', () => {
    render(
      <ChartCard title="Completion rate" summary="n/a" table={{ ...table, rows: [] }}>
        <div data-testid="chart" />
      </ChartCard>,
    );
    expect(screen.queryByTestId('chart')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByRole('heading', { name: 'No data for this period' })).toBeInTheDocument();
  });
});

describe('PermissionDenied', () => {
  it('explains the denial without naming the resource', () => {
    render(<PermissionDenied />);
    expect(
      screen.getByRole('heading', { name: 'You do not have access to this' }),
    ).toBeInTheDocument();
  });
});
