import {
  AddGroupMembersResult,
  GroupListPage,
  GroupMemberListPage,
  GroupMemberView,
  GroupView,
  type CreateGroupBody,
  type GroupListQuery,
  type GroupMemberListQuery,
  type UpdateGroupBody,
} from '@vachelearn/contracts';
import { call, queryString } from './browser';

/*
 * Groups from the browser (Slice 3.2) through the same-origin `/api/v1` proxy. The tenant is always the session's — no
 * call names one; every change carries the CSRF token the caller read fresh, and edits name the version they read.
 */

const group = (d: unknown) => GroupView.parse(d);
const id = (value: string) => encodeURIComponent(value);
const limitOf = (limit: unknown) => (limit === undefined ? undefined : Number(limit));

export const listGroups = (query: GroupListQuery) =>
  call(`/groups${queryString({ ...query, limit: limitOf(query.limit) })}`, { method: 'GET' }, (d) =>
    GroupListPage.parse(d),
  );

export const createGroup = (body: CreateGroupBody, csrfToken: string) =>
  call('/groups', { method: 'POST', body, csrfToken }, group);

export const updateGroup = (groupId: string, body: UpdateGroupBody, csrfToken: string) =>
  call(`/groups/${id(groupId)}`, { method: 'PATCH', body, csrfToken }, group);

export const setGroupArchived = (
  groupId: string,
  archived: boolean,
  reason: string,
  csrfToken: string,
) =>
  call(
    `/groups/${id(groupId)}/${archived ? 'archive' : 'reactivate'}`,
    { method: 'POST', body: { reason }, csrfToken },
    group,
  );

export const listGroupMembers = (groupId: string, query: GroupMemberListQuery) =>
  call(
    `/groups/${id(groupId)}/members${queryString({ ...query, limit: limitOf(query.limit) })}`,
    { method: 'GET' },
    (d) => GroupMemberListPage.parse(d),
  );

export const addGroupMembers = (groupId: string, membershipIds: string[], csrfToken: string) =>
  call(
    `/groups/${id(groupId)}/members`,
    { method: 'POST', body: { membershipIds }, csrfToken },
    (d) => AddGroupMembersResult.parse(d),
  );

export const removeGroupMember = (
  groupId: string,
  memberId: string,
  reason: string,
  csrfToken: string,
) =>
  call(
    `/groups/${id(groupId)}/members/${id(memberId)}/remove`,
    { method: 'POST', body: { reason }, csrfToken },
    (d) => GroupMemberView.parse(d),
  );
