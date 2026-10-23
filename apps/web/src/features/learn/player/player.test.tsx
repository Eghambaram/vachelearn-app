import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CoursePlayer as CoursePlayerData, PlayerLesson } from '@vachelearn/contracts';
import { buildDemoSession } from '@/mocks/demo-session';

vi.mock('@/lib/api/session', () => ({
  getSession: async () => buildDemoSession('learner', 'demo-tenant-1'),
}));

const { getCoursePlayer, getLessonView } = await import('@/lib/api/learner');
const { CoursePlayer } = await import('./course-player');

// Fixed clock: 22 Oct 2026, 15:00 IST.
const NOW = new Date('2026-10-22T09:30:00.000Z');
const FIRE_SAFETY = 'demo-tenant-1-demo-user-enr-01';

async function renderLesson(
  pick: (lessons: PlayerLesson[], outline: CoursePlayerData) => PlayerLesson,
  enrollmentId = FIRE_SAFETY,
) {
  const outline = await getCoursePlayer(enrollmentId, { now: NOW });
  if (!outline.ok) throw new Error('expected an outline');
  const lesson = pick(
    outline.data.modules.flatMap((m) => m.lessons),
    outline.data,
  );
  const view = await getLessonView(enrollmentId, lesson.id, { now: NOW });
  if (!view.ok) throw new Error('expected a lesson');
  render(<CoursePlayer outline={outline.data} lesson={view.data} />);
  return { outline: outline.data, lesson };
}

describe('CoursePlayer', () => {
  it('shows server progress in text and as a progress bar, and the due date in words', async () => {
    await renderLesson((lessons, o) => lessons.find((l) => l.id === o.resumeLessonId)!);
    expect(
      screen.getByRole('progressbar', { name: 'Progress in Fire Safety Refresher (Demo)' }),
    ).toHaveAttribute('aria-valuenow', '60');
    expect(screen.getByText('60% complete · 12 of 20 required lessons')).toBeInTheDocument();
    expect(screen.getByText(/Due .* · in 3 days/)).toBeInTheDocument();
  });

  it('marks the current lesson and gives every lesson its state in text', async () => {
    const { lesson } = await renderLesson((lessons, o) =>
      lessons.find((l) => l.id === o.resumeLessonId)!,
    );
    const nav = screen.getByRole('navigation', { name: 'Course content' });
    const current = within(nav).getByRole('link', { current: 'page' });
    expect(current).toHaveAccessibleName(expect.stringContaining(lesson.title));
    expect(current).toHaveAccessibleName(expect.stringContaining('In progress · Current lesson'));
    expect(within(nav).getAllByRole('link', { name: /· Completed/ })).toHaveLength(15);
    expect(within(nav).getAllByRole('link')).toHaveLength(25);
  });

  it('phones: the lesson list is a disclosure that opens and closes', async () => {
    await renderLesson((lessons) => lessons[0]!);
    const toggle = screen.getByRole('button', { name: /Course content · 15 of 25 done/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('previous / next cross module boundaries and are disabled at the ends', async () => {
    await renderLesson((lessons) => lessons[0]!);
    expect(screen.getByRole('button', { name: 'Previous lesson' })).toBeDisabled();
    expect(screen.getByRole('link', { name: /^Next lesson ?\(1\.2/ })).toBeInTheDocument();
  });

  it('the last lesson of a module links on to the next module', async () => {
    await renderLesson((lessons) => lessons[4]!);
    expect(screen.getByRole('link', { name: /^Next lesson ?\(2\.1/ })).toBeInTheDocument();
  });

  it('final lesson: next is disabled', async () => {
    await renderLesson((lessons) => lessons.at(-1)!);
    expect(screen.getByRole('button', { name: 'Next lesson' })).toBeDisabled();
    expect(screen.getByRole('link', { name: /^Previous lesson ?\(5\.4/ })).toBeInTheDocument();
  });
});

describe('completion actions follow the lesson’s rule (D-041) and are not connected', () => {
  it('a manual lesson offers "Mark as complete", which says nothing was saved', async () => {
    await renderLesson((lessons) =>
      lessons.find((l) => l.completionRule === 'manual' && l.progress !== 'completed')!,
    );
    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();
    await userEvent.click(screen.getByRole('button', { name: 'Mark as complete' }));
    expect(status).toHaveTextContent('Not yet connected');
    expect(status).toHaveTextContent('Nothing was saved.');
    // Progress did not move.
    expect(screen.getByRole('progressbar', { name: /Progress in/ })).toHaveAttribute(
      'aria-valuenow',
      '60',
    );
  });

  it('a document offers an acknowledgement instead', async () => {
    await renderLesson((lessons) =>
      lessons.find((l) => l.type === 'document' && l.progress !== 'completed')!,
    );
    expect(screen.getByRole('button', { name: 'I have read this document' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as complete' })).toBeNull();
  });

  it('video and assessment lessons have no manual completion', async () => {
    await renderLesson((lessons) =>
      lessons.find((l) => l.type === 'video' && l.progress !== 'completed')!,
    );
    expect(screen.queryByRole('button', { name: 'Mark as complete' })).toBeNull();
    expect(screen.getByText(/watched 90% of the video/)).toBeInTheDocument();
    expect(screen.getByText(/Demo video: there is no media/)).toBeInTheDocument();
  });

  it('an assessment lesson with no attempts offers to start one, which is not connected (D-071)', async () => {
    await renderLesson(
      (lessons) => lessons.find((l) => l.type === 'assessment')!,
      'demo-tenant-1-demo-user-enr-04',
    );
    expect(screen.queryByRole('button', { name: 'Mark as complete' })).toBeNull();
    expect(screen.getByText(/Completes when you pass the assessment\./)).toBeVisible();
    expect(screen.getByText('You have not started this assessment yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start attempt 1 of 3' }));
    expect(screen.getByRole('status')).toHaveTextContent('No attempt was started.');
  });

  it('an assessment lesson lists the learner’s attempts and offers no new one while one is open (D-073)', async () => {
    await renderLesson(
      (lessons) => lessons.find((l) => l.type === 'assessment')!,
      'demo-tenant-1-demo-user-enr-03',
    );
    expect(screen.getByRole('link', { name: 'View result of attempt 1' })).toHaveAttribute(
      'href',
      '/learn/attempts/demo-tenant-1-demo-user-enr-03-att-1',
    );
    expect(screen.getByRole('link', { name: 'Continue attempt 2' })).toBeInTheDocument();
    expect(screen.getByText('58.3%')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start attempt/ })).toBeNull();
  });

  it('a completed lesson shows when it was completed and offers no action', async () => {
    await renderLesson((lessons) => lessons.find((l) => l.progress === 'completed')!);
    expect(screen.getByText(/You completed this lesson on/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as complete' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'I have read this document' })).toBeNull();
  });

  it('external links open in a new tab without access to this page', async () => {
    await renderLesson((lessons) => lessons.find((l) => l.type === 'link')!);
    const link = screen.getByRole('link', { name: /opens in a new tab/ });
    expect(link).toHaveAttribute('href', 'https://example.com/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
