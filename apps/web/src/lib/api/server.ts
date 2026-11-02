import { ApiErrorBody } from '@vachelearn/contracts';
import { serverApiGet } from '@/lib/auth/session';
import type { ApiResult } from './client';

/*
 * Reads from the API for server components (2.5b): the browser's session cookie forwarded server to server, the answer
 * parsed with the shared contract. No session → 401; no answer → status 0; an answer that does not match the contract
 * is an error, never trusted. Tenant and scope are the API's: no tenant id is ever sent.
 */

type Failure = Extract<ApiResult<never>, { ok: false }>;

const failure = (status: number, code: string, message: string): Failure => ({
  ok: false,
  status,
  error: { code, message, requestId: 'none' },
});

export async function serverRead<T>(
  path: string,
  parse: (data: unknown) => T,
): Promise<ApiResult<T>> {
  let res: Response | null;
  try {
    res = await serverApiGet(path);
  } catch {
    return failure(0, 'NETWORK', 'The service could not be reached');
  }
  if (!res) return failure(401, 'UNAUTHENTICATED', 'Not signed in');
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
