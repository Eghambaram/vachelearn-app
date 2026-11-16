import { GroupListPage, GroupMemberListPage, GroupView } from '@vachelearn/contracts';
import { queryString } from './browser';
import { serverRead } from './server';

/*
 * First render of the group screens (Slice 3.2): reads on the server with the browser's session cookie. The API
 * decides tenant, branch scope and permissions; these functions only ask.
 */

export const readGroups = (query: Record<string, string | undefined> = {}) =>
  serverRead(`/groups${queryString(query)}`, (d) => GroupListPage.parse(d));

export const readGroup = (groupId: string) =>
  serverRead(`/groups/${encodeURIComponent(groupId)}`, (d) => GroupView.parse(d));

export const readGroupMembers = (groupId: string, query: Record<string, string | undefined> = {}) =>
  serverRead(`/groups/${encodeURIComponent(groupId)}/members${queryString(query)}`, (d) =>
    GroupMemberListPage.parse(d),
  );
