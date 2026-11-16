import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CourseAdminView, CourseDraftView } from '@vachelearn/contracts';
import { CourseBasics, NewCourse } from './course-forms';

const refresh = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

const ID = (n: number) => `0190f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const DRAFT: CourseDraftView = {
  id: ID(2),
  version: 3,
  title: 'Lockout tagout (Demo)',
  summary: null,
  description: null,
  category: null,
  tags: [],
  level: null,
  deliveryMode: null,
  language: 'en',
  durationMinutes: null,
  objectives: [],
  audience: null,
  prerequisites: null,
  updatedAt: '2026-11-16T08:00:00.000Z',
};
const COURSE = (
  over: Partial<CourseAdminView> & { draft?: CourseDraftView } = {},
): CourseAdminView & { draft: CourseDraftView } => ({
  id: ID(1),
  slug: 'lockout-tagout',
  status: 'draft' as const,
  owner: { membershipId: ID(9), displayName: 'Admin (Demo)' },
  publishedVersion: null,
  draft: DRAFT,
  createdAt: '2026-11-16T08:00:00.000Z',
  updatedAt: '2026-11-16T08:00:00.000Z',
  canEdit: true,
  ...over,
});
const SESSION = {
  user: { id: ID(99), email: 'admin@example.test', displayName: 'Admin (Demo)' },
  activeTenant: null,
  support: null,
  csrfToken: 'c'.repeat(32),
  expiresAt: '2026-11-20T10:00:00.000Z',
};
const TAG = (n: number, name: string) => ({
  id: ID(50 + n),
  name,
  status: 'active' as const,
  archivedAt: null,
  archivedReason: null,
  version: 1,
  createdAt: '2026-11-16T08:00:00.000Z',
  updatedAt: '2026-11-16T08:00:00.000Z',
});

/** A fetch stub answering by path prefix; records each call's full path and body. */
function api(routes: [string, { status: number; body?: unknown }][]) {
  const calls: { path: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const path = url.replace('/api/v1', '');
      calls.push({
        path,
        method: init.method ?? 'GET',
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      const route = routes.find(([prefix]) => path.startsWith(prefix))?.[1] ?? { status: 500 };
      return new Response(route.body === undefined ? null : JSON.stringify(route.body), {
        status: route.status,
      });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
  push.mockReset();
});

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
});

describe('CourseBasics', () => {
  it('saves only the changed fields with the version read', async () => {
    const calls = api([
      ['/auth/me', { status: 200, body: SESSION }],
      [
        `/courses/${ID(1)}/draft`,
        {
          status: 200,
          body: COURSE({
            draft: {
              ...DRAFT,
              version: 4,
              title: 'Lockout and tagout',
              tags: [{ id: ID(51), name: 'PPE', status: 'active' }],
            },
          }),
        },
      ],
    ]);
    render(<CourseBasics course={COURSE()} categories={[]} tags={[TAG(1, 'PPE')]} />);
    const user = userEvent.setup({ delay: null });
    const title = screen.getByLabelText(/Course title/);
    await user.clear(title);
    await user.type(title, 'Lockout and tagout');
    await user.click(screen.getByRole('checkbox', { name: 'PPE' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Draft saved.')).toBeInTheDocument();
    const save = calls.find((c) => c.method === 'PATCH')!;
    expect(save.body).toEqual({ version: 3, title: 'Lockout and tagout', tagIds: [ID(51)] });
  });

  it('a stale save is refused: says so, keeps nothing, and offers to reload the draft', async () => {
    api([
      ['/auth/me', { status: 200, body: SESSION }],
      [
        `/courses/${ID(1)}/draft`,
        { status: 409, body: { error: { code: 'CONFLICT', message: 'x', requestId: 'r' } } },
      ],
    ]);
    render(<CourseBasics course={COURSE()} categories={[]} tags={[]} />);
    const user = userEvent.setup({ delay: null });
    await user.type(screen.getByLabelText(/Summary/), 'Written meanwhile');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Someone else saved this draft meanwhile')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reload the draft' }));
    expect(refresh).toHaveBeenCalled();
  });

  it('checks the title and duration before sending', async () => {
    const calls = api([]);
    render(<CourseBasics course={COURSE()} categories={[]} tags={[]} />);
    const user = userEvent.setup({ delay: null });
    await user.clear(screen.getByLabelText(/Course title/));
    await user.type(screen.getByLabelText(/Course title/), 'ab');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(screen.getByLabelText(/Course title/)).toHaveAccessibleDescription(/3 to 120/);
    expect(calls).toEqual([]);
  });

  it('is read-only for course readers who cannot edit (D-127)', () => {
    api([]);
    render(<CourseBasics course={COURSE({ canEdit: false })} categories={[]} tags={[]} />);
    expect(screen.getByText('Only a Tenant Admin can edit this draft.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Course title/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
  });
});

describe('NewCourse', () => {
  it('creates the draft and opens it', async () => {
    const calls = api([
      ['/auth/me', { status: 200, body: SESSION }],
      ['/courses', { status: 201, body: COURSE() }],
    ]);
    render(<NewCourse categories={[]} />);
    const user = userEvent.setup({ delay: null });
    await user.type(screen.getByLabelText(/Course title/), 'Lockout tagout');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith(`/admin/courses/${ID(1)}`));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      title: 'Lockout tagout',
      language: 'en',
      categoryId: null,
    });
  });
});
