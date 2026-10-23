import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AttemptView } from '@vachelearn/contracts';
import { buildDemoSession } from '@/mocks/demo-session';

vi.mock('@/lib/api/session', () => ({
  getSession: async () => buildDemoSession('learner', 'demo-tenant-1'),
}));

const { getAttempt } = await import('@/lib/api/learner');
const { AttemptTaker } = await import('./attempt-taker');
const { AttemptResult } = await import('./attempt-result');

// Fixed clock: 22 Oct 2026, 15:00 IST.
const NOW = new Date('2026-10-22T09:30:00.000Z');
const OPEN = 'demo-tenant-1-demo-user-enr-03-att-2';

async function load(id: string) {
  const result = await getAttempt(id, { now: NOW });
  if (!result.ok) throw new Error(`expected data, got ${result.status}`);
  return result.data;
}

type Taking = AttemptView & { body: Extract<AttemptView['body'], { kind: 'taking' }> };
type Result = AttemptView & { body: Extract<AttemptView['body'], { kind: 'result' }> };

async function renderTaker(adjust: (d: Taking) => Taking = (d) => d) {
  const data = await load(OPEN);
  if (data.body.kind !== 'taking') throw new Error('expected an open attempt');
  render(<AttemptTaker data={adjust({ ...data, body: data.body })} demo />);
}

describe('AttemptTaker', () => {
  it('starts from the answers the server holds, with the demo banner and no score anywhere', async () => {
    await renderTaker();
    expect(screen.getByRole('note')).toHaveTextContent('Demo — answers are not saved');
    expect(screen.getByText('3 of 10 answered')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Questions' });
    expect(within(nav).getByRole('button', { name: 'Question 1, answered' })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(within(nav).getByRole('button', { name: 'Question 4, not answered' })).toBeVisible();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('single choice is a labelled radio group; multiple select is a group of checkboxes', async () => {
    await renderTaker();
    const radios = screen.getByRole('radiogroup', {
      name: /first step before operating a machine/,
    });
    expect(within(radios).getAllByRole('radio')).toHaveLength(4);
    expect(
      within(radios).getByRole('radio', { name: 'Check for visible hazards around the machine' }),
    ).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Question 4, not answered' }));
    expect(screen.getByText('Select all that apply.')).toBeVisible();
    const group = screen.getByRole('group', { name: /physical hazards/ });
    await userEvent.click(within(group).getByRole('checkbox', { name: 'Noise' }));
    await userEvent.click(within(group).getByRole('checkbox', { name: 'Moving machinery' }));
    expect(within(group).getAllByRole('checkbox', { checked: true })).toHaveLength(2);
    expect(screen.getByText('4 of 10 answered')).toBeInTheDocument();
    await userEvent.click(within(group).getByRole('checkbox', { name: 'Noise' }));
    expect(within(group).getAllByRole('checkbox', { checked: true })).toHaveLength(1);
  });

  it('previous / next move one question at a time and focus the new question', async () => {
    await renderTaker();
    expect(screen.getByRole('button', { name: 'Previous question' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next question' }));
    expect(screen.getByText('Question 2 of 10 · 1 point')).toBeInTheDocument();
    await act(() => new Promise(requestAnimationFrame));
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
  });

  it('review lists unanswered questions; submit confirms its impact and is not connected (D-071)', async () => {
    await renderTaker();
    await userEvent.click(screen.getByRole('button', { name: 'Question 10, not answered' }));
    await userEvent.click(screen.getByRole('button', { name: 'Review answers' }));
    expect(screen.getByRole('heading', { name: 'Review your answers' })).toBeVisible();
    expect(
      screen.getByText(/You have answered 3 of 10 questions\. Unanswered questions score 0\./),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Submit answers' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Submit your answers?' });
    expect(dialog).toHaveTextContent('This is attempt 2 of 3. 7 unanswered questions score 0.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Submit answers' }));
    expect(screen.getByRole('status')).toHaveTextContent('Not yet connected');
    expect(screen.getByRole('status')).toHaveTextContent('Nothing was submitted.');
  });
});

describe('AttemptTimer inside the taker (server-anchored, D-055)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  });
  afterEach(() => vi.useRealTimers());

  const deadlineIn = (seconds: number) => (d: Taking) => ({
    ...d,
    attempt: {
      ...d.attempt,
      deadlineAt: new Date(Date.parse(d.generatedAt) + seconds * 1000).toISOString(),
    },
  });

  it('counts down from the server time, announces the last minute once, then locks answering', async () => {
    await renderTaker(deadlineIn(62));
    expect(screen.getByRole('timer')).toHaveTextContent('1:02');
    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('0:59');
    expect(screen.getByText('1 minute remaining')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Time is up.');
    expect(screen.getAllByRole('radio').every((r) => r.hasAttribute('disabled'))).toBe(true);
  });

  it('an attempt already past its deadline opens locked', async () => {
    await renderTaker(deadlineIn(-5));
    expect(screen.getByRole('timer')).toHaveTextContent('0:00');
    expect(screen.getByRole('alert')).toHaveTextContent('Time is up.');
  });
});

describe('AttemptResult (D-023 score only, D-073 retake)', () => {
  async function renderResult(id: string) {
    const data = await load(id);
    if (data.body.kind !== 'result') throw new Error('expected a graded attempt');
    render(<AttemptResult data={{ ...data, body: data.body } as Result} />);
  }

  it('a failed attempt shows score, points and pass mark, never answers; history keeps every attempt', async () => {
    await renderResult('demo-tenant-1-demo-user-enr-03-att-1');
    expect(screen.getByText('58.3%', { selector: 'dd' })).toBeVisible();
    expect(screen.getByText('7 of 12 points')).toBeVisible();
    expect(screen.getByText('Pass mark 70%')).toBeVisible();
    expect(screen.getByText(/correct options are not shown/)).toBeVisible();
    expect(screen.queryByText(/first step before operating a machine/)).toBeNull();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[2]).toHaveTextContent('Not submitted');
    // Attempt 2 is still open, so no new attempt can start.
    expect(screen.queryByRole('button', { name: /Start attempt/ })).toBeNull();
  });

  it('a passed attempt separates passing from course completion and offers no retake', async () => {
    await renderResult('demo-tenant-1-demo-user-enr-07-att-2');
    expect(
      screen.getByText(/You passed\. Passing this assessment is one requirement/),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /Start attempt/ })).toBeNull();
  });

  it('a timed-out failure says so and offers a retake, which is not connected', async () => {
    await renderResult('demo-tenant-1-demo-user-enr-02-att-1');
    expect(screen.getByText(/Time ran out/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Start attempt 2 of 3' }));
    expect(screen.getByRole('status')).toHaveTextContent('No attempt was started.');
  });
});
