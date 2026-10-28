import { z } from 'zod';
import { IsoInstant } from './common';

/*
 * Authentication (Slice 2.3b; D-010, D-084, D-085). The browser reaches these through the web app's /api proxy, so the
 * session lives in a first-party `__Host-` cookie that scripts cannot read. Mutations of a signed-in caller carry
 * the session's CSRF token in the `x-csrf-token` header; the token comes from the sign-in response and `GET /auth/me`.
 */

/** Header a signed-in browser sends on every POST/PUT/PATCH/DELETE. */
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Sign-in body. The password is not checked against the policy here — only bounded, so a huge body cannot buy an
 * expensive hash. Wrong password and unknown email get the same 401 (spec §5 AC).
 */
export const LoginBody = z
  .object({
    email: z.string().trim().max(254),
    password: z.string().min(1).max(256),
  })
  .strict();

export const SessionUser = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
});

/** Response of `POST /auth/login` and `GET /auth/me`. */
export const AuthSessionView = z.object({
  user: SessionUser,
  csrfToken: z.string().min(20),
  /** When the session ends at the latest (D-084: 7 days); idle time also ends it (8 hours). */
  expiresAt: IsoInstant,
});
export type AuthSessionView = z.infer<typeof AuthSessionView>;

/**
 * `POST /auth/password/forgot`. Always answers 202 with no body, whether or not the address has an account (D-087), so
 * the response never reveals who is registered.
 */
export const ForgotPasswordBody = z.object({ email: z.string().trim().max(254) }).strict();

/**
 * `POST /auth/password/set` — consumes a set-password or reset link (D-083, D-087). The token travels in the link's
 * fragment (`/set-password#token=…`), so it never reaches a server log or a Referer; the page posts it here. The new
 * password must meet the policy (D-051); a problem is a 422 field error on `password` (`too_short`, `too_long`,
 * `too_common`). An unknown, used, revoked or expired token is a 400 `INVALID_LINK`.
 */
export const SetPasswordBody = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    password: z.string().min(1).max(256),
  })
  .strict();
