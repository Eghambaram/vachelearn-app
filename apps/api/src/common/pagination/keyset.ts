import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ApiException } from '../errors/api-exception';

/*
 * Keyset pagination (CLAUDE.md lists: `{ data, page: { nextCursor, limit } }`). A cursor holds the last row's sort
 * value and id plus a fingerprint of the query it came from — the caller's scope included — and is HMAC-signed with a
 * server secret, so it cannot be forged or carried to another query, tenant or scope (422). Scope is always applied
 * in the WHERE clause from the request context, never taken from the cursor. Cursors carry ids and sort values, never
 * personal data (isolation reviews 1.5.8 and 2.2).
 */

export type SortKind = 'string' | 'instant';
type CursorBody = { v: string; id: string; k: string };

const Body = z.object({ v: z.string().max(200), id: z.uuid(), k: z.string() });

export class Cursors {
  constructor(private readonly secret: string) {}

  private sign(payload: string) {
    return createHmac('sha256', this.secret).update(payload).digest('base64url').slice(0, 22);
  }

  encode(value: string, id: string, key: string) {
    const payload = Buffer.from(
      JSON.stringify({ v: value, id, k: key } satisfies CursorBody),
    ).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  /** The position a cursor points to; 422 when it is forged, malformed or from another query. */
  decode(cursor: string, key: string, kind: SortKind): { value: string | Date; id: string } {
    const [payload, signature, extra] = cursor.split('.');
    if (payload && signature && extra === undefined) {
      const expected = Buffer.from(this.sign(payload));
      const given = Buffer.from(signature);
      if (expected.length === given.length && timingSafeEqual(expected, given)) {
        try {
          const body = Body.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
          if (body.k === key) {
            if (kind === 'string') return { value: body.v, id: body.id };
            const instant = new Date(body.v);
            if (!Number.isNaN(instant.getTime())) return { value: instant, id: body.id };
          }
        } catch {
          // fall through to the 422
        }
      }
    }
    throw invalidCursor();
  }
}

export function invalidCursor() {
  return ApiException.validation([
    { field: 'cursor', code: 'invalid', message: 'Cursor does not match this query' },
  ]);
}

export function queryKey(parts: readonly unknown[]) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('base64url').slice(0, 16);
}

/** Prisma `where` fragment for "rows after (value, id)" in the given order, ties broken by id. */
export function afterCursor(field: string, direction: 'asc' | 'desc', value: unknown, id: string) {
  const op = direction === 'asc' ? 'gt' : 'lt';
  return { OR: [{ [field]: { [op]: value } }, { [field]: value, id: { [op]: id } }] };
}

export const CURSORS = Symbol('CURSORS');
