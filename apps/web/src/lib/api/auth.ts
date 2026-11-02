import { AuthSessionView, SupportSessionView } from '@vachelearn/contracts';
import { call } from './browser';

/*
 * Authentication calls from the browser (Slice 2.3d). They go to `/api/v1/*` on this app's own origin, which forwards
 * them to the API (D-085), so the session cookie is first-party and HttpOnly: this code never sees it. Responses are
 * parsed with the shared contracts; a body that does not match is treated as an error, never trusted.
 */

const noBody = () => undefined;

export const login = (input: { email: string; password: string }) =>
  call('/auth/login', { method: 'POST', body: input }, (d) => AuthSessionView.parse(d));

export const currentSession = () =>
  call('/auth/me', { method: 'GET' }, (d) => AuthSessionView.parse(d));

export const logout = (csrfToken: string) =>
  call('/auth/logout', { method: 'POST', csrfToken }, noBody);

export const forgotPassword = (input: { email: string }) =>
  call('/auth/password/forgot', { method: 'POST', body: input }, noBody);

export const setPassword = (input: { token: string; password: string }) =>
  call('/auth/password/set', { method: 'POST', body: input }, noBody);

/** Switch the session's active tenant to one of the caller's own memberships (D-089). */
export const switchTenant = (membershipId: string, csrfToken: string) =>
  call('/auth/session/tenant', { method: 'POST', body: { membershipId }, csrfToken }, (d) =>
    AuthSessionView.parse(d),
  );

/** Platform staff: open a read-only support session into a tenant (D-037). */
export const startSupportSession = (
  input: { tenantId: string; reason: string },
  csrfToken: string,
) =>
  call('/platform/support-sessions', { method: 'POST', body: input, csrfToken }, (d) =>
    SupportSessionView.parse(d),
  );

export const endSupportSession = (sessionId: string, csrfToken: string) =>
  call(
    `/platform/support-sessions/${encodeURIComponent(sessionId)}/end`,
    { method: 'POST', csrfToken },
    noBody,
  );
