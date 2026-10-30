import {
  ApiErrorBody,
  AuthSessionView,
  CSRF_HEADER,
  SupportSessionView,
} from '@vachelearn/contracts';
import type { ApiResult } from './client';

/*
 * Authentication calls from the browser (Slice 2.3d). They go to `/api/v1/*` on this app's own origin, which forwards
 * them to the API (D-085), so the session cookie is first-party and HttpOnly: this code never sees it. Responses are
 * parsed with the shared contracts; a body that does not match is treated as an error, never trusted.
 */

type Failure = Extract<ApiResult<never>, { ok: false }>;

const failure = (status: number, code: string, message: string): Failure => ({
  ok: false,
  status,
  error: { code, message, requestId: 'none' },
});

async function call<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown; csrfToken?: string },
  parse: (data: unknown) => T,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: init.method,
      credentials: 'same-origin',
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(init.csrfToken ? { [CSRF_HEADER]: init.csrfToken } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    return failure(0, 'NETWORK', 'The service could not be reached');
  }
  const data: unknown = await res.json().catch(() => null);
  if (res.ok) {
    try {
      return { ok: true, data: parse(data) };
    } catch {
      return failure(res.status, 'UNKNOWN', 'Unexpected response');
    }
  }
  const body = ApiErrorBody.safeParse(data);
  return body.success
    ? { ok: false, status: res.status, error: body.data.error }
    : failure(res.status, 'UNKNOWN', 'Unexpected response');
}

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
