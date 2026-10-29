import { z } from 'zod';
import { TenantRoleKey } from './auth';
import { IsoInstant } from './common';
import { LifecycleBody } from './tenancy';

/*
 * Role assignments (Slice 2.4b; D-053, D-091–D-094; matrix "Granting rules"). Tenant routes need `role.assign`: a
 * Tenant Admin assigns any tenant role tenant-wide or on a branch; a Branch Admin assigns only Learner or Instructor,
 * only on its own branches, only to members already in one of them. Nobody changes their own assignments. Members are
 * named by membership id (from the tenant's people list, 2.5) — never a tenant id: the tenant is the caller's.
 */

export const RoleAssignmentView = z.object({
  id: z.uuid(),
  membershipId: z.uuid(),
  role: TenantRoleKey,
  branch: z.object({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
  createdAt: IsoInstant,
});
export type RoleAssignmentView = z.infer<typeof RoleAssignmentView>;

/** `GET /role-assignments?membershipId=…`: one member's live assignments the caller may see. */
export const RoleAssignmentListQuery = z.object({ membershipId: z.uuid() }).strict();
export const RoleAssignmentList = z.object({ data: z.array(RoleAssignmentView) });

/** `POST /role-assignments`. `branchId` null = the whole tenant. */
export const CreateRoleAssignmentBody = z
  .object({
    membershipId: z.uuid(),
    role: TenantRoleKey,
    branchId: z.uuid().nullable(),
  })
  .strict();

/** `POST /role-assignments/:id/revoke`: a reason is always required. */
export const RevokeRoleAssignmentBody = LifecycleBody;

/** `POST /platform/tenants/:id/first-admin` (D-092). */
export const FirstAdminBody = z
  .object({
    email: z.email().max(254),
    displayName: z.string().trim().min(1).max(120),
  })
  .strict();
export const FirstAdminResult = z.object({
  userId: z.uuid(),
  membershipId: z.uuid(),
  assignmentId: z.uuid(),
  /** True when the account was created now (a set-password email was queued). */
  accountCreated: z.boolean(),
});
export type FirstAdminResult = z.infer<typeof FirstAdminResult>;
