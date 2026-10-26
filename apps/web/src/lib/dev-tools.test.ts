import {
  isDemoVerificationEnabled,
  isDemoWorkspacesEnabled,
  isDesignGalleryEnabled,
} from './dev-tools';

describe('isDesignGalleryEnabled', () => {
  it('is off in production by default', () => {
    expect(isDesignGalleryEnabled({ NODE_ENV: 'production' })).toBe(false);
  });

  it('is on in development by default', () => {
    expect(isDesignGalleryEnabled({ NODE_ENV: 'development' })).toBe(true);
  });

  it('can be forced on in production (E2E) and off in development', () => {
    expect(isDesignGalleryEnabled({ NODE_ENV: 'production', ENABLE_DESIGN_GALLERY: 'true' })).toBe(
      true,
    );
    expect(
      isDesignGalleryEnabled({ NODE_ENV: 'development', ENABLE_DESIGN_GALLERY: 'false' }),
    ).toBe(false);
  });

  it('treats any other value as unset', () => {
    expect(isDesignGalleryEnabled({ NODE_ENV: 'production', ENABLE_DESIGN_GALLERY: '1' })).toBe(
      false,
    );
  });
});

describe('isDemoWorkspacesEnabled (D-063)', () => {
  it('is off in production unless explicitly enabled, on in development', () => {
    expect(isDemoWorkspacesEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(
      isDemoWorkspacesEnabled({ NODE_ENV: 'production', ENABLE_DEMO_WORKSPACES: 'true' }),
    ).toBe(true);
    expect(isDemoWorkspacesEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(
      isDemoWorkspacesEnabled({ NODE_ENV: 'development', ENABLE_DEMO_WORKSPACES: 'false' }),
    ).toBe(false);
  });

  it('is independent of the design gallery switch', () => {
    expect(isDemoWorkspacesEnabled({ NODE_ENV: 'production', ENABLE_DESIGN_GALLERY: 'true' })).toBe(
      false,
    );
  });
});

describe('isDemoVerificationEnabled (D-074)', () => {
  it('is its own switch: demo workspaces alone do not expose public verification in production', () => {
    expect(isDemoVerificationEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(
      isDemoVerificationEnabled({ NODE_ENV: 'production', ENABLE_DEMO_WORKSPACES: 'true' }),
    ).toBe(false);
    expect(
      isDemoVerificationEnabled({ NODE_ENV: 'production', ENABLE_DEMO_VERIFICATION: 'true' }),
    ).toBe(true);
    expect(
      isDemoVerificationEnabled({ NODE_ENV: 'development', ENABLE_DEMO_VERIFICATION: 'false' }),
    ).toBe(false);
  });
});
