import { isDesignGalleryEnabled } from './design-gallery';

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
