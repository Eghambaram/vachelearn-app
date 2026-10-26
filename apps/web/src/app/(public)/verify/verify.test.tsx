import * as LookupModule from './page';
import VerifyLookupPage from './page';
import * as LayoutModule from './layout';
import VerifyResultPage from './[verificationId]/page';

// next/navigation's notFound and redirect throw; record which one was called.
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

afterEach(() => vi.unstubAllEnvs());

describe('public verification pages are demo surfaces with their own switch (D-074)', () => {
  it('are a 404 when demo verification is off, as in a production build', async () => {
    vi.stubEnv('ENABLE_DEMO_VERIFICATION', 'false');
    vi.stubEnv('ENABLE_DEMO_WORKSPACES', 'true');
    await expect(VerifyLookupPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
    await expect(
      VerifyResultPage({
        params: Promise.resolve({ verificationId: 'VL-0000-0000-0000-0000' }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('the lookup form sends a well-formed id, in any typed form, to its canonical result page', async () => {
    vi.stubEnv('ENABLE_DEMO_VERIFICATION', 'true');
    await expect(
      VerifyLookupPage({ searchParams: Promise.resolve({ id: 'vl 7k3m q9tr 2xwb hn4p' }) }),
    ).rejects.toThrow('NEXT_REDIRECT /verify/VL-7K3M-Q9TR-2XWB-HN4P');
  });

  it('a repeated id parameter is an invalid id, not a server error', async () => {
    vi.stubEnv('ENABLE_DEMO_VERIFICATION', 'true');
    const page = await VerifyLookupPage({ searchParams: Promise.resolve({ id: ['a', 'b'] }) });
    expect(page).toBeTruthy();
  });

  it('a typed variant of an id redirects to the one canonical URL', async () => {
    vi.stubEnv('ENABLE_DEMO_VERIFICATION', 'true');
    await expect(
      VerifyResultPage({ params: Promise.resolve({ verificationId: 'vl-7k3m-q9tr-2xwb-hn4p' }) }),
    ).rejects.toThrow('NEXT_REDIRECT /verify/VL-7K3M-Q9TR-2XWB-HN4P');
  });

  it('an unknown id and a malformed escape are the same 404', async () => {
    vi.stubEnv('ENABLE_DEMO_VERIFICATION', 'true');
    for (const verificationId of ['VL-0000-0000-0000-0000', '%E0%A4%A']) {
      await expect(
        VerifyResultPage({ params: Promise.resolve({ verificationId }) }),
      ).rejects.toThrow('NEXT_NOT_FOUND');
    }
  });

  it('are rendered per request, so the runtime flag decides (never baked as a static 404 at build time)', () => {
    expect(LayoutModule.dynamic).toBe('force-dynamic');
    expect(LookupModule.dynamic).toBe('force-dynamic');
  });
});
