import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GroupMemberListPage, GroupView } from '@vachelearn/contracts';
import { GroupMembers } from './group-members';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const ID = (n: number) => `0190f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const BRANCH = { id: ID(90), code: 'PUN', name: 'Pune' };
const GROUP = (over: Partial<GroupView> = {}): GroupView => ({
  id: ID(1),
  name: 'Night shift',
  description: null,
  branch: BRANCH,
  status: 'active',
  memberCount: 1,
  archivedAt: null,
  archivedReason: null,
  version: 1,
  createdAt: '2026-11-13T08:00:00.000Z',
  updatedAt: '2026-11-13T08:00:00.000Z',
  canManage: true,
  ...over,
});
const MEMBERS: GroupMemberListPage = {
  data: [
    {
      id: ID(10),
      membershipId: ID(20),
      displayName: 'Ravi Kumar (Demo)',
      email: 'ravi@example.test',
      memberStatus: 'deactivated',
      addedAt: '2026-11-13T08:00:00.000Z',
      removedAt: null,
      removedReason: null,
      canRemove: true,
    },
  ],
  page: { nextCursor: null, limit: 25 },
};
const HISTORY: GroupMemberListPage = {
  data: [
    {
      ...MEMBERS.data[0]!,
      id: ID(11),
      memberStatus: 'active',
      removedAt: '2026-11-13T09:00:00.000Z',
      removedReason: 'Moved to days',
      canRemove: false,
    },
  ],
  page: { nextCursor: null, limit: 25 },
};
const PERSON = {
  membershipId: ID(30),
  displayName: 'Asha Patel (Demo)',
  email: 'asha@example.test',
  status: 'active',
  employeeId: null,
  department: null,
  jobRole: null,
  branches: [{ ...BRANCH, primary: true }],
  roles: [],
  createdAt: '2026-11-13T08:00:00.000Z',
};
const SESSION = {
  user: { id: ID(99), email: 'admin@example.test', displayName: 'Admin (Demo)' },
  activeTenant: null,
  support: null,
  csrfToken: 'c'.repeat(32),
  expiresAt: '2026-11-20T10:00:00.000Z',
};

/** A fetch stub answering by path prefix; records each call's full path and body. */
function api(routes: [string, { status: number; body?: unknown }][]) {
  const calls: { path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const path = url.replace('/api/v1', '');
      calls.push({ path, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const route = routes.find(([prefix]) => path.startsWith(prefix))?.[1] ?? { status: 500 };
      return new Response(route.body === undefined ? null : JSON.stringify(route.body), {
        status: route.status,
      });
    }),
  );
  return calls;
}

const ok = (data: GroupMemberListPage) => ({ ok: true as const, data });

afterEach(() => vi.unstubAllGlobals());

// Radix Select uses pointer capture and scrollIntoView, which jsdom does not implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
});

describe('GroupMembers', () => {
  it('a reader sees members with their status, and no add or remove actions', () => {
    api([]);
    render(
      <GroupMembers group={GROUP({ canManage: false })} initial={ok(MEMBERS)} canSearchPeople />,
    );
    const table = screen.getByRole('table', { name: /Group members/ });
    expect(within(table).getByText('Ravi Kumar (Demo)')).toBeInTheDocument();
    // Deactivated members stay listed as such (D-120).
    expect(within(table).getByText('Deactivated')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Add people' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
  });

  it('a manager sees no Remove for a member outside their reach (D-125)', () => {
    api([]);
    const locked = { ...MEMBERS, data: [{ ...MEMBERS.data[0]!, canRemove: false }] };
    render(<GroupMembers group={GROUP()} initial={ok(locked)} canSearchPeople />);
    expect(screen.getByText('Ravi Kumar (Demo)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
  });

  it('a manager finds people of the group branch only, and adds one by membership id', async () => {
    const calls = api([
      ['/people', { status: 200, body: { data: [PERSON], page: { nextCursor: null, limit: 10 } } }],
      ['/auth/me', { status: 200, body: SESSION }],
      [`/groups/${ID(1)}/members?`, { status: 200, body: MEMBERS }],
      [`/groups/${ID(1)}/members`, { status: 200, body: { added: 1, alreadyMembers: 0 } }],
    ]);
    render(<GroupMembers group={GROUP()} initial={ok(MEMBERS)} canSearchPeople />);
    expect(screen.getByText('Only people of Pune can join this group.')).toBeInTheDocument();
    // Each row action names its person (WCAG 2.4.6).
    expect(screen.getByRole('button', { name: 'Remove Ravi Kumar (Demo)' })).toBeInTheDocument();
    const user = userEvent.setup({ delay: null });
    await user.type(screen.getByLabelText('Find a person'), 'asha');
    const add = await screen.findByRole('button', { name: 'Add Asha Patel (Demo)' });
    const search = calls.find((c) => c.path.startsWith('/people'))!;
    expect(search.path).toContain(`branchId=${BRANCH.id}`);
    expect(search.path).toContain('status=active');
    await user.click(add);
    expect(await screen.findByText('Asha Patel (Demo) added to the group.')).toBeInTheDocument();
    const post = calls.find((c) => c.path === `/groups/${ID(1)}/members` && c.body);
    expect(post?.body).toEqual({ membershipIds: [ID(30)] });
  });

  it('an archived group offers no adding, and says why', () => {
    api([]);
    render(
      <GroupMembers group={GROUP({ status: 'archived' })} initial={ok(MEMBERS)} canSearchPeople />,
    );
    expect(screen.getByText(/This group is archived/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Find a person')).not.toBeInTheDocument();
  });

  it('without user.read a manager is told to ask an administrator instead of a dead search', () => {
    api([]);
    render(<GroupMembers group={GROUP()} initial={ok(MEMBERS)} canSearchPeople={false} />);
    expect(screen.getByText(/You cannot search people here/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Find a person')).not.toBeInTheDocument();
  });

  it('the history shows when and why each person was removed', async () => {
    const calls = api([[`/groups/${ID(1)}/members?`, { status: 200, body: HISTORY }]]);
    render(<GroupMembers group={GROUP()} initial={ok(MEMBERS)} canSearchPeople />);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'Removed' }));
    // Read from the DOM: the closing Select briefly aria-hides the page (as in the compliance report test).
    await waitFor(() =>
      expect(document.querySelector('tbody')?.textContent).toContain('Moved to days'),
    );
    expect(screen.getByText('Removed members')).toBeInTheDocument();
    expect(calls.some((c) => c.path.includes('state=removed'))).toBe(true);
  });
});
