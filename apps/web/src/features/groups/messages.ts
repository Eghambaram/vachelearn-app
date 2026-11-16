import { authErrorMessage } from '@/features/auth/messages';
import type { ApiResult } from '@/lib/api/client';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

type Failure = Extract<ApiResult<unknown>, { ok: false }>;

/** Our sentences for refused group changes (Slice 3.2). Never the server's text. */
export function groupErrorMessage(result: Failure): string {
  const e = t.groups.errors;
  const field = result.error.fieldErrors?.[0];
  if (field?.field === 'name' && field.code === 'taken') return e.nameTaken;
  if (field?.field === 'membershipIds' && field.code === 'deactivated') return e.deactivatedMember;
  switch (result.error.code) {
    case 'GROUP_ARCHIVED':
      return e.archivedGroup;
    case 'BRANCH_INACTIVE':
      return e.branchInactive;
    case 'OUTSIDE_BRANCH_SCOPE':
      return e.outsideScope;
    case 'CONFLICT':
      return e.conflict;
    case 'INVALID_STATE':
      return e.invalidState;
    case 'SUPPORT_READ_ONLY':
      return e.supportReadOnly;
    case 'NOT_FOUND':
      return e.notFound;
    case 'FORBIDDEN':
      return e.forbidden;
  }
  if (result.status === 422) return e.invalid;
  return result.status === 404 ? e.notFound : authErrorMessage(result);
}
