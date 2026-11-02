import { ApiErrorBody, CSRF_HEADER } from '@vachelearn/contracts';
import type { ApiResult } from './client';

/*
 * Calls from the browser to `/api/v1/*` on this app's own origin, which forwards them to the API (D-085), so the
 * session cookie is first-party and HttpOnly: this code never sees it. Responses are parsed with the shared contracts;
 * a body that does not match is treated as an error, never trusted. Shared by sign-in (2.3d) and the admin screens.
 */

type Failure = Extract<ApiResult<never>, { ok: false }>;

const failure = (status: number, code: string, message: string): Failure => ({
  ok: false,
  status,
  error: { code, message, requestId: 'none' },
});

export async function call<T>(
  path: string,
  init: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown; csrfToken?: string },
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
  // 204: nothing to parse.
  const data: unknown = res.status === 204 ? undefined : await res.json().catch(() => null);
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

/** A query string from defined values only (`undefined` and empty strings are left out). */
export function queryString(query: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}
