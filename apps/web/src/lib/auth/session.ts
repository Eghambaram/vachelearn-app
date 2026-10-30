import { AuthSessionView, SessionContextView } from '@vachelearn/contracts';
import { cookies } from 'next/headers';
import { resolveApiInternalUrl } from './api-internal-url';

/*
 * The signed-in user, for server components (read-only: the API is the authority — web rules). The browser's session
 * cookie is forwarded to `GET /api/v1/auth/me` on the API directly (server to server), never stored or decoded here.
 * "Unavailable" (the API could not answer) is kept apart from "signed out", so a page can say so instead of sending
 * a signed-in user to the sign-in form. Every action is still checked by the API.
 */

export const SESSION_COOKIE = '__Host-vl_session';
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export type AuthState =
  | { status: 'signed-in'; session: AuthSessionView }
  | { status: 'signed-out' }
  | { status: 'unavailable' };

export async function getAuthState(): Promise<AuthState> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // Only a value shaped like our tokens is forwarded: nothing else can be smuggled into the cookie header.
  if (!token || !TOKEN.test(token)) return { status: 'signed-out' };
  try {
    // The value next.config.ts validated and baked in at build time (the same one the /api/v1 rewrite uses).
    const res = await fetch(
      `${resolveApiInternalUrl(process.env.VL_API_INTERNAL_URL)}/api/v1/auth/me`,
      {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(3_000),
      },
    );
    if (res.status === 401) return { status: 'signed-out' };
    if (!res.ok) return { status: 'unavailable' };
    const parsed = AuthSessionView.safeParse(await res.json());
    return parsed.success
      ? { status: 'signed-in', session: parsed.data }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

export type SessionContextState =
  | { status: 'signed-in'; context: SessionContextView }
  | { status: 'signed-out' }
  /** A session cookie was sent but the API refused it (expired, revoked, signed out elsewhere). */
  | { status: 'rejected' }
  | { status: 'unavailable' };

/** Server-side GET on the API with the browser's session cookie (only a well-formed one is forwarded). */
export async function serverApiGet(path: string): Promise<Response | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !TOKEN.test(token)) return null;
  return fetch(`${resolveApiInternalUrl(process.env.VL_API_INTERNAL_URL)}/api/v1${path}`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(3_000),
  });
}

/** What the shell renders for this session (2.4d): roles, memberships, permissions, support — from the API only. */
export async function getSessionContext(): Promise<SessionContextState> {
  try {
    const res = await serverApiGet('/auth/session');
    if (!res) return { status: 'signed-out' };
    if (res.status === 401) return { status: 'rejected' };
    if (!res.ok) return { status: 'unavailable' };
    const parsed = SessionContextView.safeParse(await res.json());
    return parsed.success
      ? { status: 'signed-in', context: parsed.data }
      : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
