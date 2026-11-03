import { authErrorMessage } from '@/features/auth/messages';
import type { ApiResult } from '@/lib/api/client';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

type Failure = Extract<ApiResult<unknown>, { ok: false }>;

/** Our sentences for refused branch changes. Never the server's text. */
export function branchErrorMessage(result: Failure): string {
  const e = t.branches.errors;
  const field = result.error.fieldErrors?.[0];
  if (field?.field === 'code' && field.code === 'taken') return e.codeTaken;
  if (result.status === 422) return e.invalid;
  return common(result, e);
}

/** Our sentences for refused settings changes. */
export function settingsErrorMessage(result: Failure): string {
  if (result.status === 422) return t.settings.errors.invalid;
  return common(result, t.settings.errors);
}

/** Our sentences for refused job-role changes. */
export function jobRoleErrorMessage(result: Failure): string {
  const field = result.error.fieldErrors?.[0];
  if (field?.field === 'name') {
    return field.code === 'taken' ? t.jobRoles.errors.nameTaken : t.jobRoles.errors.nameInvalid;
  }
  return common(result, t.jobRoles.errors);
}

function common(
  result: Failure,
  e: {
    conflict: string;
    invalidState: string;
    notFound: string;
    forbidden: string;
    supportReadOnly: string;
  },
) {
  switch (result.error.code) {
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
    default:
      return result.status === 404 ? e.notFound : authErrorMessage(result);
  }
}

/** The API's invalid field names → our field messages (422 `fieldErrors` onto the form, web rules). */
export function fieldMessages<K extends string>(
  fields: readonly string[],
  messages: Record<K, string>,
): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const field of fields) {
    if (field in messages) out[field as K] = messages[field as K];
  }
  return out;
}
