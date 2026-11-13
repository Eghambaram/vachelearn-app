import { z } from 'zod';
import { TenantRoleKey } from './auth';
import { Cursor, IsoInstant, ListLimit, cursorPage } from './common';
import { LocaleTag, TimeZone } from './tenancy';

/*
 * People basics (Slice 2.5a; D-026, D-047, D-101–D-105). Members of the caller's own tenant under /api/v1/people,
 * named by membership id — never a tenant id. Branch-scoped callers (Branch Admin) see members who share one of their
 * branches (D-026), and only those branches; the primary marker is shown to tenant-wide callers only. Admins edit the
 * organisation's fields of a member, never the account's name (D-105). Job roles are the tenant's reference list;
 * tenant settings are the tenant's own name, time zone and locale.
 */

const Version = z.number().int().min(1);
const BranchRef = z.object({ id: z.uuid(), code: z.string(), name: z.string() });

export const MemberStatus = z.enum(['active', 'deactivated']);
export type MemberStatus = z.infer<typeof MemberStatus>;

// ── Job roles (tenant reference list, D-047) ─────────────────────────────────────────────────────────────────────────

export const JobRoleStatus = z.enum(['active', 'inactive']);
export type JobRoleStatus = z.infer<typeof JobRoleStatus>;

const JobRoleName = z.string().trim().min(2).max(80);

export const JobRoleView = z.object({
  id: z.uuid(),
  name: z.string(),
  status: JobRoleStatus,
  deactivatedAt: IsoInstant.nullable(),
  deactivatedReason: z.string().nullable(),
  version: Version,
  createdAt: IsoInstant,
  updatedAt: IsoInstant,
});
export type JobRoleView = z.infer<typeof JobRoleView>;

export const JobRoleListQuery = z.strictObject({
  status: JobRoleStatus.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  cursor: Cursor.optional(),
  limit: ListLimit,
});
export type JobRoleListQuery = z.input<typeof JobRoleListQuery>;

export const JobRoleListPage = cursorPage(JobRoleView);
export type JobRoleListPage = z.infer<typeof JobRoleListPage>;

export const CreateJobRoleBody = z.strictObject({ name: JobRoleName });
export type CreateJobRoleBody = z.input<typeof CreateJobRoleBody>;

export const UpdateJobRoleBody = z.strictObject({ version: Version, name: JobRoleName });
export type UpdateJobRoleBody = z.input<typeof UpdateJobRoleBody>;

// ── People ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** One branch of a member, as far as the caller sees: `primary` only for tenant-wide callers (D-026). */
export const PersonBranch = BranchRef.extend({ primary: z.boolean().optional() });
export type PersonBranch = z.infer<typeof PersonBranch>;

export const PersonSummary = z.object({
  membershipId: z.uuid(),
  displayName: z.string(),
  email: z.string(),
  status: MemberStatus,
  employeeId: z.string().nullable(),
  department: z.string().nullable(),
  jobRole: z.object({ id: z.uuid(), name: z.string(), status: JobRoleStatus }).nullable(),
  branches: z.array(PersonBranch),
  /** Live roles the caller may see (a branch-scoped caller: tenant-wide roles and roles on its own branches). */
  roles: z.array(z.object({ role: TenantRoleKey, branch: BranchRef.nullable() })),
  createdAt: IsoInstant,
});
export type PersonSummary = z.infer<typeof PersonSummary>;

export const PersonView = PersonSummary.extend({
  /** The global account (D-105: not editable here). */
  accountStatus: z.enum(['active', 'deactivated']),
  /** False until the person follows their set-password link (D-083). */
  accountVerified: z.boolean(),
  deactivatedAt: IsoInstant.nullable(),
  deactivatedReason: z.string().nullable(),
  /** Whether this caller may change this member (D-101; never themselves). The API checks again on every change. */
  canManage: z.boolean(),
  version: Version,
  updatedAt: IsoInstant,
});
export type PersonView = z.infer<typeof PersonView>;

export const PeopleListQuery = z.strictObject({
  status: MemberStatus.optional(),
  /** Narrows the caller's branch scope; it never widens it (a branch outside the scope lists nobody). */
  branchId: z.uuid().optional(),
  jobRoleId: z.uuid().optional(),
  /** Name, email or employee id. */
  search: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['name', 'email', 'createdAt']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  cursor: Cursor.optional(),
  limit: ListLimit,
});
export type PeopleListQuery = z.input<typeof PeopleListQuery>;

export const PeopleListPage = cursorPage(PersonSummary);
export type PeopleListPage = z.infer<typeof PeopleListPage>;

/** D-047 organisation fields; `null` clears one. The account's name is not here (D-105). */
export const UpdatePersonBody = z
  .strictObject({
    version: Version,
    employeeId: z.string().trim().min(1).max(40).nullable().optional(),
    department: z.string().trim().min(1).max(100).nullable().optional(),
    jobRoleId: z.uuid().nullable().optional(),
  })
  .refine((b) => Object.keys(b).some((k) => k !== 'version'), 'nothing to change');
export type UpdatePersonBody = z.input<typeof UpdatePersonBody>;

/** Add a branch, or make one of the member's branches primary. */
export const PersonBranchBody = z.strictObject({ branchId: z.uuid() });
export type PersonBranchBody = z.infer<typeof PersonBranchBody>;

// ── Tenant settings (the caller's own tenant) ────────────────────────────────────────────────────────────────────────

export const TenantSettingsView = z.object({
  displayName: z.string(),
  slug: z.string(),
  defaultTimezone: z.string(),
  defaultLocale: z.string(),
  /** How long an invitation link stays valid, in days (D-050: 1–30). */
  invitationExpiryDays: z.number().int().min(1).max(30),
  /** Feature switches (D-031) are set by platform staff; shown here read-only. */
  features: z.object({
    classroom: z.boolean(),
    surveys: z.boolean(),
    commerce: z.boolean(),
    publicCatalog: z.boolean(),
    analytics: z.boolean(),
  }),
  version: Version,
  updatedAt: IsoInstant,
});
export type TenantSettingsView = z.infer<typeof TenantSettingsView>;

export const UpdateTenantSettingsBody = z
  .strictObject({
    version: Version,
    displayName: z.string().trim().min(2).max(120).optional(),
    defaultTimezone: TimeZone.optional(),
    defaultLocale: LocaleTag.optional(),
    invitationExpiryDays: z.number().int().min(1).max(30).optional(),
  })
  .refine((b) => Object.keys(b).some((k) => k !== 'version'), 'nothing to change');
export type UpdateTenantSettingsBody = z.input<typeof UpdateTenantSettingsBody>;
