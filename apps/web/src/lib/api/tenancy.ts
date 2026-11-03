import {
  BranchListPage,
  BranchView,
  JobRoleListPage,
  JobRoleView,
  TenantSettingsView,
  type BranchListQuery,
  type CreateBranchBody,
  type JobRoleListQuery,
  type UpdateBranchBody,
  type UpdateTenantSettingsBody,
} from '@vachelearn/contracts';
import { call, queryString } from './browser';

/*
 * Branches, tenant settings and job roles from the browser (Slice 2.5c) through the same-origin `/api/v1` proxy. The
 * tenant is always the session's — no call names one; every change carries the CSRF token the caller read fresh, and
 * edits name the version they read (409 when someone else changed it first).
 */

const branch = (d: unknown) => BranchView.parse(d);
const jobRole = (d: unknown) => JobRoleView.parse(d);
const id = (value: string) => encodeURIComponent(value);
const limitOf = (limit: unknown) => (limit === undefined ? undefined : Number(limit));

export const listBranches = (query: BranchListQuery) =>
  call(
    `/branches${queryString({ ...query, limit: limitOf(query.limit) })}`,
    { method: 'GET' },
    (d) => BranchListPage.parse(d),
  );

export const createBranch = (body: CreateBranchBody, csrfToken: string) =>
  call('/branches', { method: 'POST', body, csrfToken }, branch);

export const updateBranch = (branchId: string, body: UpdateBranchBody, csrfToken: string) =>
  call(`/branches/${id(branchId)}`, { method: 'PATCH', body, csrfToken }, branch);

export const setBranchActive = (
  branchId: string,
  active: boolean,
  reason: string,
  csrfToken: string,
) =>
  call(
    `/branches/${id(branchId)}/${active ? 'reactivate' : 'deactivate'}`,
    { method: 'POST', body: { reason }, csrfToken },
    branch,
  );

export const updateTenantSettings = (body: UpdateTenantSettingsBody, csrfToken: string) =>
  call('/tenant-settings', { method: 'PATCH', body, csrfToken }, (d) =>
    TenantSettingsView.parse(d),
  );

export const listJobRoles = (query: JobRoleListQuery) =>
  call(
    `/job-roles${queryString({ ...query, limit: limitOf(query.limit) })}`,
    { method: 'GET' },
    (d) => JobRoleListPage.parse(d),
  );

export const createJobRole = (name: string, csrfToken: string) =>
  call('/job-roles', { method: 'POST', body: { name }, csrfToken }, jobRole);

export const renameJobRole = (roleId: string, version: number, name: string, csrfToken: string) =>
  call(
    `/job-roles/${id(roleId)}`,
    { method: 'PATCH', body: { version, name }, csrfToken },
    jobRole,
  );

export const setJobRoleActive = (
  roleId: string,
  active: boolean,
  reason: string,
  csrfToken: string,
) =>
  call(
    `/job-roles/${id(roleId)}/${active ? 'reactivate' : 'deactivate'}`,
    { method: 'POST', body: { reason }, csrfToken },
    jobRole,
  );
