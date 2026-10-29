import { forgotPassword, login, logout } from './auth';

const SESSION = {
  user: {
    id: '01900000-0000-7000-8000-000000000001',
    email: 'asha@example.test',
    displayName: 'Asha (Demo)',
  },
  activeTenant: null,
  support: null,
  csrfToken: 'c'.repeat(43),
  expiresAt: '2026-11-04T09:00:00.000Z',
};

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('auth API client (through the web origin, D-085)', () => {
  it('posts JSON to /api/v1 on the same origin and parses the session', async () => {
    const fetchMock = respond(200, SESSION);
    vi.stubGlobal('fetch', fetchMock);
    const result = await login({ email: 'asha@example.test', password: 'secret passphrase' });
    expect(result).toEqual({ ok: true, data: SESSION });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/auth/login');
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' });
    expect(init.headers['content-type']).toBe('application/json');
  });

  it('returns the API error envelope, and treats a malformed body as an error', async () => {
    vi.stubGlobal(
      'fetch',
      respond(401, {
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email or password is incorrect',
          requestId: 'req_1',
        },
      }),
    );
    expect(await login({ email: 'a@b.test', password: 'x' })).toMatchObject({
      ok: false,
      status: 401,
      error: { code: 'INVALID_CREDENTIALS', requestId: 'req_1' },
    });
    vi.stubGlobal('fetch', respond(200, { user: 'not a session' }));
    expect(await login({ email: 'a@b.test', password: 'x' })).toMatchObject({
      ok: false,
      error: { code: 'UNKNOWN' },
    });
  });

  it('a network failure is status 0, never a thrown error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await forgotPassword({ email: 'a@b.test' })).toMatchObject({ ok: false, status: 0 });
  });

  it('sign-out sends the CSRF token header and no body', async () => {
    const fetchMock = respond(204, undefined);
    vi.stubGlobal('fetch', fetchMock);
    expect(await logout('t'.repeat(43))).toEqual({ ok: true, data: undefined });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers['x-csrf-token']).toBe('t'.repeat(43));
    expect(init.body).toBeUndefined();
  });
});
