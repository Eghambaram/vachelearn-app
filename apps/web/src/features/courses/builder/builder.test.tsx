import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CourseDraft } from '@vachelearn/contracts';
import { emptyDraft } from '@/mocks/course-draft';
import { ContentStep } from './content-step';
import { draftReducer } from './draft-reducer';

// The builder keeps its step in the URL; a stand-in router records replaces.
let search = new URLSearchParams('step=publish');
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: (url: string) => (search = new URLSearchParams(url.split('?')[1])),
  }),
  usePathname: () => '/admin/courses/new/build',
  useSearchParams: () => search,
}));

const { CourseBuilder } = await import('./course-builder');

const draft: CourseDraft = {
  ...emptyDraft(),
  modules: [
    {
      id: 'm1',
      title: 'Basics',
      lessons: [
        { id: 'a', title: 'Alpha', type: 'text', required: true, durationMinutes: 5 },
        { id: 'b', title: 'Bravo', type: 'video', required: true, durationMinutes: 5 },
        { id: 'c', title: 'Charlie', type: 'document', required: false, durationMinutes: 5 },
      ],
    },
  ],
};

function Content() {
  const [state, dispatch] = React.useReducer(draftReducer, draft);
  return <ContentStep modules={state.modules} dispatch={dispatch} />;
}

const lessonTitles = () =>
  screen
    .getAllByRole('textbox', { name: 'Lesson title' })
    .map((i) => (i as HTMLInputElement).value);

describe('ContentStep reordering', () => {
  it('moves a lesson with the keyboard, keeps focus on it and announces the new position', async () => {
    render(<Content />);
    const user = userEvent.setup({ delay: null });
    const down = screen.getByRole('button', { name: 'Move Alpha down' });
    down.focus();
    await user.keyboard('{Enter}');
    expect(lessonTitles()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(screen.getByRole('button', { name: 'Move Alpha down' })).toHaveFocus();
    expect(screen.getByText('Alpha moved to position 2 of 3.')).toBeInTheDocument();
  });

  it('cannot move past the ends; focus falls back to the other direction at an edge', async () => {
    render(<Content />);
    const user = userEvent.setup({ delay: null });
    expect(screen.getByRole('button', { name: 'Move Alpha up' })).toBeDisabled();
    screen.getByRole('button', { name: 'Move Bravo down' }).focus();
    await user.keyboard('{Enter}');
    expect(lessonTitles()).toEqual(['Alpha', 'Charlie', 'Bravo']);
    expect(screen.getByRole('button', { name: 'Move Bravo down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Bravo up' })).toHaveFocus();
  });

  it('removes a lesson only after a confirmation that states the impact', async () => {
    render(<Content />);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: 'Remove Charlie' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove lesson “Charlie”?' });
    expect(dialog).toHaveTextContent('The published version is not affected.');
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(lessonTitles()).toEqual(['Alpha', 'Bravo']);
  });

  it('shows each lesson type’s completion rule (D-041)', () => {
    render(<Content />);
    expect(screen.getByText('Complete when 90% watched')).toBeInTheDocument();
    expect(screen.getByText('Complete when opened and acknowledged')).toBeInTheDocument();
  });
});

describe('CourseBuilder publish step', () => {
  it('lists what blocks publishing and never claims to have published or saved', async () => {
    search = new URLSearchParams('step=publish');
    render(<CourseBuilder initialDraft={emptyDraft()} categories={[]} assessments={[]} />);
    const user = userEvent.setup({ delay: null });
    expect(screen.getByRole('note')).toHaveTextContent('changes you make here are not saved');
    expect(screen.getByText('Add a course title (at least 3 characters).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish version 1' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(screen.getByRole('status')).toHaveTextContent('Not yet connected');
    expect(screen.queryByText(/saved successfully|published/i)).toBeNull();
  });

  it('links each problem to the step that fixes it', async () => {
    search = new URLSearchParams('step=publish');
    render(<CourseBuilder initialDraft={emptyDraft()} categories={[]} assessments={[]} />);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getAllByRole('button', { name: 'Go to Content' })[0]!);
    expect(search.get('step')).toBe('content');
  });
});
