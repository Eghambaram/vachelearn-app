import { DEFAULT_API_INTERNAL_URL, resolveApiInternalUrl } from './api-internal-url';

describe('resolveApiInternalUrl (one validated API address for the rewrite and the server)', () => {
  it('defaults to the local API and accepts bare http(s) origins', () => {
    expect(resolveApiInternalUrl(undefined)).toBe(DEFAULT_API_INTERNAL_URL);
    expect(resolveApiInternalUrl('https://api.internal.example')).toBe(
      'https://api.internal.example',
    );
  });

  it.each(['http://localhost:4000/', 'http://localhost:4000/api', 'ftp://host', 'not a url'])(
    'refuses %s',
    (value) => {
      expect(() => resolveApiInternalUrl(value)).toThrow(/bare origin/);
    },
  );
});
