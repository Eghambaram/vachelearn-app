/*
 * Developer tools and demo surfaces are never product pages. Each is on in `next dev` unless explicitly disabled, and
 * off in production builds unless its variable is exactly "true" (the E2E server sets both).
 */

type Env = Record<string, string | undefined>;

function devToolEnabled(value: string | undefined, nodeEnv: string | undefined): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return nodeEnv === 'development';
}

/** The /design token sheet and component gallery. */
export function isDesignGalleryEnabled(env: Env = process.env): boolean {
  return devToolEnabled(env.ENABLE_DESIGN_GALLERY, env.NODE_ENV);
}

/**
 * Demo workspaces (/platform, /admin, /instructor, /learn, /account, /select-workspace) and the demo role switcher
 * (D-063). Until Phase 2 authentication guards them, a production build must not expose a fake admin UI.
 */
export function isDemoWorkspacesEnabled(env: Env = process.env): boolean {
  return devToolEnabled(env.ENABLE_DEMO_WORKSPACES, env.NODE_ENV);
}
