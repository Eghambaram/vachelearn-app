import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/*
 * Request IDs (CLAUDE.md: every error envelope and log line carries one). The ID is always generated here, so a client
 * cannot reuse another request's ID to confuse log correlation or support lookups. A client's own `x-request-id`, if
 * it is a short safe token, is kept only as `clientRequestId` in the log line for tracing across systems.
 */

export const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

type WithRequestId = IncomingMessage & { id?: string };

export function requestIdOf(req: IncomingMessage): string {
  const r = req as WithRequestId;
  r.id ??= `req_${randomUUID()}`;
  return r.id;
}

/** The client's own correlation ID, when it is safe to log; never used as the request ID. */
export function clientRequestIdOf(req: IncomingMessage): string | undefined {
  const header = req.headers[REQUEST_ID_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  return value && SAFE_ID.test(value) ? value : undefined;
}

/** Express-style middleware, registered before everything else. */
export function requestIdMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  res.setHeader(REQUEST_ID_HEADER, requestIdOf(req));
  next();
}
