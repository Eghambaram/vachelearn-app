import { CSRF_HEADER } from '@vachelearn/contracts';
import { listPeople, removePersonBranch, updatePerson } from './people';

function respond(status: number, body?: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

const ID = '01900000-0000-7000-8000-0000000000a1';

describe('people API client (Slice 2.5b, same-origin proxy)', () => {
  it('lists with only the given filters and never a tenant', async () => {
    const fetchMock = respond(200, { data: [], page: { limit: 25, nextCursor: null } });
    vi.stubGlobal('fetch', fetchMock);
    const result = await listPeople({ search: 'asha', status: undefined, sort: 'name', limit: 25 });
    expect(result.ok).toBe(true);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toBe('/api/v1/people?search=asha&sort=name&limit=25');
    expect(url).not.toMatch(/tenant/i);
  });

  it('sends changes with the CSRF token and parses nothing from a 204', async () => {
    const fetchMock = respond(204);
    vi.stubGlobal('fetch', fetchMock);
    const result = await removePersonBranch(ID, ID, 'c'.repeat(43));
    expect(result).toEqual({ ok: true, data: undefined });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/v1/people/${ID}/branches/${ID}/remove`);
    expect(init.headers[CSRF_HEADER]).toBe('c'.repeat(43));
  });

  it('returns the API’s refusal as data, never as success', async () => {
    vi.stubGlobal(
      'fetch',
      respond(409, { error: { code: 'CONFLICT', message: 'Changed', requestId: 'req_1' } }),
    );
    const result = await updatePerson(ID, { version: 1, department: 'X' }, 'c'.repeat(43));
    expect(result).toMatchObject({ ok: false, status: 409, error: { code: 'CONFLICT' } });
  });
});
