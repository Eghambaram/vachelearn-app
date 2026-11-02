import { authErrorMessage } from '@/features/auth/messages';
import type { ApiResult } from '@/lib/api/client';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const e = t.people.errors;

type Failure = Extract<ApiResult<unknown>, { ok: false }>;

/** Our sentence for a refused people change. Never echoes server text: codes map to our own copy. */
export function peopleErrorMessage(result: Failure): string {
  const field = result.error.fieldErrors?.[0];
  if (field?.field === 'employeeId' && field.code === 'taken') return e.employeeIdTaken;
  if (field?.field === 'jobRoleId') return e.jobRoleUnknown;
  if (field?.field === 'branchId' && field.code === 'not_in_branch') return t.people.notInBranch;
  switch (result.error.code) {
    case 'CONFLICT':
      return e.conflict;
    case 'SELF_CHANGE':
      return e.selfChange;
    case 'OUTSIDE_BRANCH_SCOPE':
      return e.outsideScope;
    case 'LAST_TENANT_ADMIN':
      return e.lastAdmin;
    case 'BRANCH_HAS_ROLE':
      return e.branchHasRole;
    case 'PRIMARY_BRANCH':
      return e.primaryBranch;
    case 'INVALID_STATE':
      return e.invalidState;
    case 'ALREADY_ASSIGNED':
      return e.alreadyAssigned;
    case 'SUPPORT_READ_ONLY':
      return e.supportReadOnly;
    case 'NOT_FOUND':
      return e.notFound;
    case 'FORBIDDEN':
      return e.forbidden;
    default:
      return result.status === 404 ? e.notFound : authErrorMessage(result);
  }
}
