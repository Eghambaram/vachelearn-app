import type { SessionView } from '@/lib/api/session-types';
import { readBranchOptions } from '@/lib/api/people-server';
import { getMessages } from '@/lib/i18n';
import { WHOLE_ORGANISATION, type ScopeOption } from '@/features/groups/group-form';

const t = getMessages();

/**
 * What a group can cover for this caller (D-119, D-121): the whole organisation for tenant-wide roles, then the active
 * branches the API lists for them (already scoped). Display only — the API refuses anything else.
 */
export async function groupScopes(session: SessionView): Promise<ScopeOption[]> {
  const branches = session.permissions.includes('branch.read') ? await readBranchOptions() : null;
  return [
    ...(session.branchScope === null
      ? [{ id: WHOLE_ORGANISATION, label: t.groups.wholeOrganisation }]
      : []),
    ...(branches?.ok
      ? branches.data.data.map((b) => ({
          id: b.id,
          label: t.groups.branchScope(`${b.name} (${b.code})`),
        }))
      : []),
  ];
}
