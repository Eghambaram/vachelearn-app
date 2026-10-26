import { createHash } from 'node:crypto';
import type { ApiResult } from './client';

/*
 * Opaque list cursors with the API's semantics: a cursor carries an offset and a fingerprint of the query it came from
 * (tenant, scope, filters, sort, limit), so reusing it with any other query — or another tenant or scope — is a 422.
 * Server-only (node:crypto). Phase 2 replaces offsets with keyset cursors behind the same shape, and then (isolation
 * review, 1.5.8): HMAC-sign cursors with a server secret; keep only ids and positions in them — never names or other
 * personal data; add the as-of date to the key where values are computed at read time (compliance status); and always
 * apply the scope predicate from the session in the query, never from the cursor.
 */

type CursorBody = { o: number; k: string };

/** Fingerprint of everything that defines a result set. */
export function queryKey(parts: readonly unknown[]) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('base64url').slice(0, 16);
}

export function encodeCursor(offset: number, key: string) {
  return Buffer.from(JSON.stringify({ o: offset, k: key } satisfies CursorBody)).toString(
    'base64url',
  );
}

/** The offset a cursor points to, or null when it is malformed or belongs to another query. */
export function cursorOffset(cursor: string, key: string): number | null {
  try {
    const body = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<CursorBody>;
    return Number.isSafeInteger(body.o) && (body.o ?? -1) >= 0 && body.k === key
      ? (body.o as number)
      : null;
  } catch {
    return null;
  }
}

export function invalidCursor(): ApiResult<never> {
  return {
    ok: false,
    status: 422,
    error: {
      code: 'INVALID_CURSOR',
      message: 'Invalid cursor',
      requestId: 'req_demo_0422',
      fieldErrors: [
        { field: 'cursor', code: 'invalid', message: 'Cursor does not match this query' },
      ],
    },
  };
}
