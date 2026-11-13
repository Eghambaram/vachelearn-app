import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AcceptInvite } from './accept-invite';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

const TOKEN = 'T'.repeat(43);
const PREVIEW = {
  organisation: 'Acme Plant (Demo)',
  role: 'learner',
  branch: 'Pune',
  email: 'meera@example.test',
  accountExists: false,
  expiresAt: '2026-11-20T10:00:00.000Z',
};
const SESSION = (email: string) => ({
  user: { id: '0190f0a0-0000-7000-8000-000000000001', email, displayName: 'Meera (Demo)' },
  activeTenant: null,
  support: null,
  csrfToken: 'c'.repeat(32),
  expiresAt: '2026-11-20T10:00:00.000Z',
});
const ACCEPTED = {
  organisation: 'Acme Plant (Demo)',
  membershipId: '0190f0a0-0000-7000-8000-000000000002',
};
const error = (code: string, fieldErrors?: unknown[]) => ({
  error: { code, message: 'x', requestId: 'req_1', ...(fieldErrors ? { fieldErrors } : {}) },
});

type Route = { status: number; body?: unknown };

/** A fetch stub answering by path; records each call's path and body. */
function api(routes: Record<string, Route>) {
  const calls: { path: string; body: unknown; headers: Record<string, string> }[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const path = url.replace('/api/v1', '');
    calls.push({
      path,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init.headers ?? {}) as Record<string, string>,
    });
    const route = routes[path] ?? { status: 500 };
    return new Response(route.body === undefined ? null : JSON.stringify(route.body), {
      status: route.status,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function open(hash = `#token=${TOKEN}`) {
  window.history.replaceState(null, '', `/accept-invite${hash}`);
  render(<AcceptInvite />);
  return userEvent.setup({ delay: null });
}

afterEach(() => vi.unstubAllGlobals());

describe('AcceptInvite', () => {
  it('a new person: reads the token once, shows the invitation, creates the account, then asks to sign in', async () => {
    const calls = api({
      '/invitations/preview': { status: 200, body: PREVIEW },
      '/invitations/accept': { status: 201, body: ACCEPTED },
    });
    const user = open();
    expect(await screen.findByText(/invited to join Acme Plant \(Demo\)/)).toBeInTheDocument();
    expect(window.location.href).not.toContain(TOKEN);
    expect(screen.getByText('Role: Learner at Pune')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Your name/), 'Meera Iyer');
    await user.type(screen.getByLabelText(/^Choose a password/), 'a long and private passphrase');
    await user.type(screen.getByLabelText(/^Repeat the password/), 'a long and private passphrase');
    await user.click(screen.getByRole('button', { name: 'Accept and create my account' }));
    const done = await screen.findByRole('status');
    expect(done).toHaveTextContent(/Your account is ready/);
    expect(done).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(calls.map((c) => c.path)).toEqual(['/invitations/preview', '/invitations/accept']);
    expect(calls[1]!.body).toEqual({
      token: TOKEN,
      displayName: 'Meera Iyer',
      password: 'a long and private passphrase',
    });
  });

  it('checks name and matching passwords before calling the API, and maps the policy error', async () => {
    const calls = api({
      '/invitations/preview': { status: 200, body: PREVIEW },
      '/invitations/accept': {
        status: 422,
        body: error('VALIDATION_FAILED', [{ field: 'password', code: 'too_common', message: 'x' }]),
      },
    });
    const user = open();
    await user.click(await screen.findByRole('button', { name: 'Accept and create my account' }));
    expect(screen.getByLabelText(/^Your name/)).toHaveAccessibleDescription(/Enter your name/);
    expect(screen.getByLabelText(/^Your name/)).toHaveFocus();
    await user.type(screen.getByLabelText(/^Your name/), 'Meera');
    await user.type(screen.getByLabelText(/^Choose a password/), 'password one');
    await user.type(screen.getByLabelText(/^Repeat the password/), 'password two');
    await user.click(screen.getByRole('button', { name: 'Accept and create my account' }));
    expect(screen.getByLabelText(/^Repeat the password/)).toHaveAccessibleDescription(
      /not the same/,
    );
    expect(calls).toHaveLength(1);
    await user.clear(screen.getByLabelText(/^Repeat the password/));
    await user.type(screen.getByLabelText(/^Repeat the password/), 'password one');
    await user.click(screen.getByRole('button', { name: 'Accept and create my account' }));
    expect(await screen.findByLabelText(/^Choose a password/)).toHaveAccessibleDescription(
      /too common/,
    );
  });

  it('without a token, or with a dead link, says so and shows no form', async () => {
    api({});
    open('#token=short');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /needs the link from your invitation/,
    );
    expect(screen.queryByLabelText(/^Choose a password/)).toBeNull();
  });

  it('an invalid link is one message, whatever the reason', async () => {
    api({ '/invitations/preview': { status: 400, body: error('INVALID_LINK') } });
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid, used or expired/);
  });

  it('a second link opened in the same tab (fragment-only navigation) is read too', async () => {
    const calls = api({ '/invitations/preview': { status: 200, body: PREVIEW } });
    open('#token=short');
    expect(await screen.findByRole('alert')).toHaveTextContent(/needs the link/);
    const second = 'S'.repeat(43);
    window.history.replaceState(null, '', `/accept-invite#token=${second}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByText(/invited to join Acme Plant/)).toBeInTheDocument();
    expect(calls.map((c) => c.body)).toEqual([{ token: second }]);
    expect(window.location.href).not.toContain(second);
  });

  it('an existing account that is not signed in is asked to sign in', async () => {
    api({
      '/invitations/preview': { status: 200, body: { ...PREVIEW, accountExists: true } },
      '/auth/me': { status: 401, body: error('UNAUTHENTICATED') },
    });
    open();
    expect(await screen.findByText(/already have a VacheLearn account/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('signed in as the invited address: joins with the session CSRF token', async () => {
    const calls = api({
      '/invitations/preview': { status: 200, body: { ...PREVIEW, accountExists: true } },
      '/auth/me': { status: 200, body: SESSION('Meera@Example.test') },
      '/me/invitations/accept': { status: 201, body: ACCEPTED },
    });
    const user = open();
    await user.click(await screen.findByRole('button', { name: 'Join Acme Plant (Demo)' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/You have joined Acme Plant/);
    const join = calls.find((c) => c.path === '/me/invitations/accept')!;
    expect(join.body).toEqual({ token: TOKEN });
    expect(Object.values(join.headers)).toContain('c'.repeat(32));
    expect(screen.getByRole('link', { name: 'Go to my workspaces' })).toHaveAttribute(
      'href',
      '/select-workspace',
    );
  });

  it('signed in as someone else: explains and offers sign-out, never a join button', async () => {
    api({
      '/invitations/preview': { status: 200, body: { ...PREVIEW, accountExists: true } },
      '/auth/me': { status: 200, body: SESSION('other@example.test') },
    });
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent(/different address/);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Join/ })).toBeNull();
  });
});
