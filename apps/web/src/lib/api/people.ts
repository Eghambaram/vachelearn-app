import {
  PeopleListPage,
  PersonView,
  RoleAssignmentView,
  type PeopleListQuery,
  type TenantRoleKey,
  type UpdatePersonBody,
} from '@vachelearn/contracts';
import { call, queryString } from './browser';

/*
 * People screens from the browser (Slice 2.5b) through the same-origin `/api/v1` proxy. Every change sends the
 * session's CSRF token (read fresh by the caller) and names a member by membership id — never a tenant: the tenant is
 * the session's, and the API checks permission, branch scope (D-026, D-101) and versions on every call.
 */

const noBody = () => undefined;
const person = (d: unknown) => PersonView.parse(d);

export const listPeople = (query: PeopleListQuery) =>
  call(
    `/people${queryString({ ...query, limit: query.limit === undefined ? undefined : Number(query.limit) })}`,
    { method: 'GET' },
    (d) => PeopleListPage.parse(d),
  );

const member = (id: string) => `/people/${encodeURIComponent(id)}`;

export const updatePerson = (id: string, body: UpdatePersonBody, csrfToken: string) =>
  call(member(id), { method: 'PATCH', body, csrfToken }, person);

export const setPersonActive = (id: string, active: boolean, reason: string, csrfToken: string) =>
  call(
    `${member(id)}/${active ? 'reactivate' : 'deactivate'}`,
    { method: 'POST', body: { reason }, csrfToken },
    person,
  );

export const addPersonBranch = (id: string, branchId: string, csrfToken: string) =>
  call(`${member(id)}/branches`, { method: 'POST', body: { branchId }, csrfToken }, person);

export const removePersonBranch = (id: string, branchId: string, csrfToken: string) =>
  call(
    `${member(id)}/branches/${encodeURIComponent(branchId)}/remove`,
    { method: 'POST', csrfToken },
    noBody,
  );

export const setPrimaryBranch = (id: string, branchId: string, csrfToken: string) =>
  call(`${member(id)}/primary-branch`, { method: 'POST', body: { branchId }, csrfToken }, person);

export const assignRole = (
  input: { membershipId: string; role: TenantRoleKey; branchId: string | null },
  csrfToken: string,
) =>
  call('/role-assignments', { method: 'POST', body: input, csrfToken }, (d) =>
    RoleAssignmentView.parse(d),
  );

export const revokeRole = (assignmentId: string, reason: string, csrfToken: string) =>
  call(
    `/role-assignments/${encodeURIComponent(assignmentId)}/revoke`,
    { method: 'POST', body: { reason }, csrfToken },
    noBody,
  );
