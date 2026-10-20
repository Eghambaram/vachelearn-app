import type { ApiErrorBody } from '@vachelearn/contracts';

/*
 * Result of every `lib/api` call. Screens branch on it: 401 → login (Phase 2), 403 → PermissionDenied,
 * 404 → not-found, 409 → conflict + reload, 422 → field errors, otherwise ErrorState with `requestId` (web rules).
 */
export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; status: number; error: ApiErrorBody['error'] };

/**
 * Demo-only fixture states, chosen with `?demoState=` while demo workspaces are enabled (D-063), so every screen
 * state can be reviewed. Ignored entirely once a screen uses its real endpoint.
 */
export const DEMO_STATES = ['ready', 'loading', 'empty', 'error', 'forbidden'] as const;
export type DemoState = (typeof DEMO_STATES)[number];

export function parseDemoState(value: unknown): DemoState {
  return (DEMO_STATES as readonly unknown[]).includes(value) ? (value as DemoState) : 'ready';
}

export function demoError(status: 403 | 500): ApiResult<never> {
  return status === 403
    ? {
        ok: false,
        status,
        error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: 'req_demo_forbidden' },
      }
    : {
        ok: false,
        status,
        error: { code: 'INTERNAL', message: 'Internal error', requestId: 'req_demo_0500' },
      };
}
