import type { NextConfig } from 'next';
import { resolveApiInternalUrl } from './src/lib/auth/api-internal-url';

/*
 * The browser reaches the API through this app's origin (D-085): `/api/v1/*` is forwarded to API_INTERNAL_URL, so the
 * session cookie is first-party (`__Host-`) and no credentialed CORS is needed. Rewrites are fixed at build time:
 * build with the API address the server will use (default: the local API on :4000).
 *
 * Next forwards the client's own `X-Forwarded-For` unchanged and adds none of its own (checked 2026-10-28), so the
 * API's TRUST_PROXY_HOPS counts only the proxies in front of this app that append the client address (0 locally).
 */
const apiInternalUrl = resolveApiInternalUrl();
if (!process.env.API_INTERNAL_URL) {
  // Local builds use the local API; a deployment must set it (the web→API hop must be private or https).
  console.warn(`API_INTERNAL_URL is not set: /api/v1 is forwarded to ${apiInternalUrl}.`);
}

/** Headers for every page (security reviews 1.5.7 and 2.1). HSTS belongs to the production edge. */
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    // Framing, plugins, <base> and form targets are locked down now; a nonce-based script-src follows before any
    // public deployment (PROGRESS known issues).
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // A page that opens VacheLearn keeps no handle on its window (security review 2.3d).
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages ship TypeScript source (D-035); Next compiles them with the app.
  transpilePackages: ['@vachelearn/contracts'],
  // Server code reads the same API address the rewrite was built with (lib/auth/session.ts).
  env: { VL_API_INTERNAL_URL: apiInternalUrl },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiInternalUrl}/api/v1/:path*` }];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Pages that receive a secret link (#token=…): never send the URL anywhere, never cache them.
      ...['/set-password', '/reset-password'].map((source) => ({
        source,
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      })),
    ];
  },
};

export default nextConfig;
