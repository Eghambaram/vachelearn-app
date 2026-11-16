import { authErrorMessage } from '@/features/auth/messages';
import type { ApiResult } from '@/lib/api/client';
import type { CatalogKind } from '@/lib/api/course-admin';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

type Failure = Extract<ApiResult<unknown>, { ok: false }>;

/** Our sentences for refused category and tag changes (Slice 3.3). Never the server's text. */
export function catalogErrorMessage(kind: CatalogKind) {
  const k = t.catalogAdmin.kinds[kind];
  const e = t.catalogAdmin.errors;
  return (result: Failure): string => {
    const field = result.error.fieldErrors?.[0];
    if (field?.field === 'name' && field.code === 'taken') return k.nameTaken;
    if (field?.field === 'name') return k.nameInvalid;
    switch (result.error.code) {
      case 'CONFLICT':
        return e.conflict;
      case 'INVALID_STATE':
        return e.invalidState;
      case 'SUPPORT_READ_ONLY':
        return e.supportReadOnly;
      case 'NOT_FOUND':
        return k.notFound;
      case 'FORBIDDEN':
        return e.forbidden;
    }
    if (result.status === 422) return e.invalid;
    return result.status === 404 ? k.notFound : authErrorMessage(result);
  };
}

/** Our sentences for refused course changes (Slice 3.3). Conflicts are shown by the editor itself. */
export function courseErrorMessage(result: Failure): string {
  const e = t.courseAdmin.errors;
  const field = result.error.fieldErrors?.[0];
  if (field?.field === 'title') return e.titleInvalid;
  if (field?.field === 'categoryId') {
    return field.code === 'archived' ? e.categoryArchived : e.categoryUnavailable;
  }
  if (field?.field === 'tagIds')
    return field.code === 'archived' ? e.tagsArchived : e.tagsUnavailable;
  if (field?.field === 'durationMinutes') return e.durationInvalid;
  if (field?.field?.startsWith('objectives')) return e.objectivesInvalid;
  switch (result.error.code) {
    case 'CONFLICT':
      return t.courseAdmin.conflictBody;
    case 'COURSE_ARCHIVED':
      return e.archived;
    case 'NO_DRAFT':
      return e.noDraft;
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
