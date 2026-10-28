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
