import {
  BranchListPage,
  BranchView,
  JobRoleListPage,
  TenantSettingsView,
} from '@vachelearn/contracts';
import { queryString } from './browser';
import { serverRead } from './server';

/*
 * First render of the branches, settings and job-role screens (Slice 2.5c): reads on the server with the browser's
 * session cookie. The API decides tenant, branch scope and permissions; these functions only ask.
 */

export const readBranches = (query: Record<string, string | undefined> = {}) =>
  serverRead(`/branches${queryString(query)}`, (d) => BranchListPage.parse(d));

export const readBranch = (branchId: string) =>
  serverRead(`/branches/${encodeURIComponent(branchId)}`, (d) => BranchView.parse(d));

export const readTenantSettings = () =>
  serverRead('/tenant-settings', (d) => TenantSettingsView.parse(d));

export const readJobRoles = (query: Record<string, string | undefined> = {}) =>
  serverRead(`/job-roles${queryString(query)}`, (d) => JobRoleListPage.parse(d));
