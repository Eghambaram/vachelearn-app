import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignOutButton } from './sign-out-button';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

const SESSION = {
  user: { id: '01900000-0000-7000-8000-000000000001', email: 'a@b.test', displayName: 'A (Demo)' },
  csrfToken: 'c'.repeat(43),
  expiresAt: '2026-11-04T09:00:00.000Z',
};
const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockReset();
});

describe('SignOutButton (no false sign-out on a shared device)', () => {
  it('signs out with the fresh CSRF token, then goes to the sign-in page', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, SESSION))
      .mockResolvedValueOnce(json(204));
    vi.stubGlobal('fetch', fetchMock);
    render(<SignOutButton />);
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'Sign out' }));
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/v1/auth/logout');
    expect(fetchMock.mock.calls[1]![1].headers['x-csrf-token']).toBe(SESSION.csrfToken);
    expect(replace).toHaveBeenCalledWith('/login?signedOut=1');
  });

  it('already signed out (401): goes to the sign-in page without calling logout', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json(401, { error: { code: 'UNAUTHENTICATED', message: 'x', requestId: 'req_1' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<SignOutButton />);
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'Sign out' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/login?signedOut=1');
  });

  it.each([
    [
      'the service answers 500',
      () =>
        Promise.resolve(
          json(500, { error: { code: 'INTERNAL', message: 'x', requestId: 'req_9' } }),
        ),
    ],
    ['the network fails', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('%s: stays on the page with a focused error and does not pretend', async (_label, answer) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(answer));
    render(<SignOutButton />);
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'Sign out' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveFocus();
    expect(replace).not.toHaveBeenCalled();
  });
});
