import {
  BranchListPage,
  JobRoleListPage,
  PeopleListPage,
  PersonView,
  RoleAssignmentList,
} from '@vachelearn/contracts';
import { queryString } from './browser';
import { serverRead } from './server';

/*
 * People screens' first render (Slice 2.5b): reads on the server with the browser's session cookie. The API decides
 * tenant, branch scope and what is visible; these functions only ask.
 */

export const readPeople = (query: Record<string, string | undefined> = {}) =>
  serverRead(`/people${queryString(query)}`, (d) => PeopleListPage.parse(d));

export const readPerson = (id: string) =>
  serverRead(`/people/${encodeURIComponent(id)}`, (d) => PersonView.parse(d));

export const readRoleAssignments = (membershipId: string) =>
  serverRead(`/role-assignments${queryString({ membershipId })}`, (d) =>
    RoleAssignmentList.parse(d),
  );

/** Active branches the caller can see (filters and pickers); the API scopes them. */
export const readBranchOptions = () =>
  serverRead('/branches?status=active&limit=100', (d) => BranchListPage.parse(d));

/** The tenant's active job roles (D-047), for the profile form and the filter. */
export const readJobRoleOptions = () =>
  serverRead('/job-roles?status=active&limit=100', (d) => JobRoleListPage.parse(d));
