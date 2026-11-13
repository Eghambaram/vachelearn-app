import { authErrorMessage } from '@/features/auth/messages';
import type { ApiResult } from '@/lib/api/client';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

type Failure = Extract<ApiResult<unknown>, { ok: false }>;

/** Our sentence for a refused invitation change (inviter side). Never echoes server text. */
export function invitationErrorMessage(result: Failure): string {
  const e = t.invitations.errors;
  switch (result.error.code) {
    case 'ALREADY_MEMBER':
      return e.alreadyMember;
    case 'INVITATION_PENDING':
      return e.pending;
    case 'INVITER_CANNOT_GRANT':
      return e.inviterCannotGrant;
    case 'RATE_LIMITED':
      return e.rateLimited;
    case 'INVALID_STATE':
      return e.notPending;
    case 'SUPPORT_READ_ONLY':
      return e.supportReadOnly;
    case 'NOT_FOUND':
      return e.notFound;
    case 'FORBIDDEN':
      return e.forbidden;
    default:
      if (result.status === 404) return e.notFound;
      if (result.status === 422) return e.invalid;
      return authErrorMessage(result);
  }
}

/** Our sentence for a failed acceptance (the invited person's side). */
export function acceptErrorMessage(result: Failure): string {
  const a = t.acceptInvite;
  switch (result.error.code) {
    case 'INVALID_LINK':
      return a.invalid;
    case 'ALREADY_MEMBER':
      return a.alreadyMember;
    case 'SIGN_IN_REQUIRED':
      return a.signInRequired;
    case 'WRONG_ACCOUNT':
      return a.wrongAccount;
    case 'SUPPORT_ACTIVE':
      return a.supportActive;
    default:
      return authErrorMessage(result);
  }
}
