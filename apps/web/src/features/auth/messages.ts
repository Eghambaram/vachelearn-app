import type { ApiResult } from '@/lib/api/client';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

type Failure = Extract<ApiResult<unknown>, { ok: false }>;

/** The sentence to show for a failed auth call. Never echoes server text: codes map to our own copy. */
export function authErrorMessage(result: Failure): string {
  // No answer, or a gateway error without our envelope (the API is down behind the web proxy).
  if (
    result.status === 0 ||
    ([502, 503, 504].includes(result.status) && result.error.requestId === 'none')
  ) {
    return t.auth.unreachable;
  }
  switch (result.error.code) {
    case 'INVALID_CREDENTIALS':
      return t.auth.invalidCredentials;
    case 'RATE_LIMITED':
      return t.auth.rateLimited;
    case 'BUSY':
      return t.auth.busy;
    case 'INVALID_LINK':
      return t.auth.linkInvalid;
    default:
      // A support reference only when the API gave one.
      return result.error.requestId === 'none'
        ? t.auth.unexpected
        : t.auth.unexpectedWithReference(result.error.requestId);
  }
}

/** Password problems from the API (D-051 policy codes, or the contract's length bound) → field messages. */
export function passwordProblemMessage(code: string): string {
  switch (code) {
    case 'too_short':
      return t.auth.passwordTooShort;
    case 'too_long':
    case 'too_big':
      return t.auth.passwordTooLong;
    case 'too_common':
      return t.auth.passwordTooCommon;
    default:
      return t.auth.passwordUnusable;
  }
}
