/**
 * The /design token sheet is a developer tool, never a product page. It is on in `next dev` unless explicitly
 * disabled, and off in production builds unless ENABLE_DESIGN_GALLERY=true (used by the E2E suite).
 */
export function isDesignGalleryEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.ENABLE_DESIGN_GALLERY === 'true') return true;
  if (env.ENABLE_DESIGN_GALLERY === 'false') return false;
  return env.NODE_ENV === 'development';
}
