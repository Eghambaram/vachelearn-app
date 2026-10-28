/*
 * Where the web server reaches the API (D-085). One validated value for both the `/api/v1` rewrite (fixed at build
 * time in next.config.ts) and server-side calls (lib/auth/session.ts, which reads the value the build baked in), so the
 * browser and the pages can never talk to different APIs. Plain module: next.config.ts imports it too.
 */

export const DEFAULT_API_INTERNAL_URL = 'http://localhost:4000';

/** The configured origin, validated; throws on anything but a bare http(s) origin. */
export function resolveApiInternalUrl(value: string | undefined = process.env.API_INTERNAL_URL) {
  const url = value ?? DEFAULT_API_INTERNAL_URL;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('API_INTERNAL_URL must be a bare origin such as http://localhost:4000');
  }
  if (parsed.origin !== url || !/^https?:$/.test(parsed.protocol)) {
    throw new Error('API_INTERNAL_URL must be a bare origin such as http://localhost:4000');
  }
  return url;
}
