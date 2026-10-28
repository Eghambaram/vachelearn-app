import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/*
 * Session tokens and cookie (D-010, D-085). The cookie carries 32 random bytes; the database stores only their
 * SHA-256, so a database leak yields no usable session. The CSRF token is an HMAC of the session id with
 * SESSION_SECRET: tied to one session, never stored, unreadable by another site.
 */

/** `__Host-`: Secure, Path=/, no Domain — the browser refuses it from any other host or over plain HTTP. */
export const SESSION_COOKIE = '__Host-vl_session';

export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function csrfTokenFor(secret: string, sessionId: string) {
  return createHmac('sha256', secret).update(`csrf:${sessionId}`).digest('base64url');
}

/** The session cookie's value, or undefined. Only this cookie is read; nothing else from the header is kept. */
export function sessionTokenFrom(req: IncomingMessage): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === SESSION_COOKIE) {
      const value = part.slice(eq + 1).trim();
      // Our tokens are 43 base64url characters; anything else is not ours.
      return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
    }
  }
  return undefined;
}

export const sessionCookieOptions = (expires: Date) =>
  ({
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires,
  }) as const;
