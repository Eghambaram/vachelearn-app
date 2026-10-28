import { z } from 'zod';
import { Cursor, IsoInstant, ListLimit, cursorPage } from './common';
// One definition of tenant status (D-066), shared with the platform dashboard contract.
import { TenantStatus } from './platform-dashboard';

/*
 * Tenancy (Slice 2.2; spec §4). Platform staff manage tenants under /api/v1/platform/tenants (`tenant.*`, platform
 * scope). Tenant admins manage their own tenant's branches under /api/v1/branches — the tenant comes from the session,
 * never from these bodies or queries (bodies are strict: an extra `tenantId` is a 422). State changes are explicit
 * action endpoints with a reason; every change is audited.
 */

/** IANA time zone known to the runtime, e.g. "Asia/Kolkata". */
export const TimeZone = z
  .string()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'must be an IANA time zone such as Asia/Kolkata');

/** BCP 47 locale tag, stored canonicalised ("en-in" → "en-IN"). */
export const LocaleTag = z
  .string()
  .max(35)
  .transform((tag, ctx) => {
    try {
      return Intl.getCanonicalLocales(tag)[0]!;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'must be a locale tag such as en-IN' });
      return z.NEVER;
    }
  });

/** D-079: lowercase letters, digits and single hyphens, 3–40 characters; fixed once created. */
export const TenantSlug = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase letters, digits and single hyphens');

/** D-048 fixed list. */
export const Industry = z.enum([
  'manufacturing',
  'construction',
  'oil_and_gas',
  'logistics',
  'utilities',
  'other',
]);
export type Industry = z.infer<typeof Industry>;

const DisplayName = z.string().trim().min(2).max(120);
const Reason = z.string().trim().min(3).max(500);
const Version = z.number().int().min(1);

export const TenantView = z.object({
  id: z.uuid(),
  slug: TenantSlug,
  displayName: z.string(),
  status: TenantStatus,
  defaultTimezone: z.string(),
  defaultLocale: z.string(),
  primaryContactEmail: z.string().nullable(),
  industry: Industry.nullable(),
  suspendedAt: IsoInstant.nullable(),
  suspendedReason: z.string().nullable(),
  archivedAt: IsoInstant.nullable(),
  archivedReason: z.string().nullable(),
  version: Version,
  createdAt: IsoInstant,
  updatedAt: IsoInstant,
});
export type TenantView = z.infer<typeof TenantView>;

export const CreateTenantBody = z.strictObject({
  slug: TenantSlug,
  displayName: DisplayName,
  defaultTimezone: TimeZone,
  defaultLocale: LocaleTag.optional(),
  primaryContactEmail: z.email().max(254).optional(),
  industry: Industry.optional(),
});
export type CreateTenantBody = z.input<typeof CreateTenantBody>;

/** Edits name the version they read (409 when someone else changed it first). The slug is not editable (D-079). */
export const UpdateTenantBody = z
  .strictObject({
    version: Version,
    displayName: DisplayName.optional(),
    defaultTimezone: TimeZone.optional(),
    defaultLocale: LocaleTag.optional(),
    primaryContactEmail: z.email().max(254).nullable().optional(),
    industry: Industry.nullable().optional(),
  })
  .refine((b) => Object.keys(b).some((k) => k !== 'version'), 'nothing to change');
export type UpdateTenantBody = z.input<typeof UpdateTenantBody>;

/** Suspend, reactivate, archive, deactivate: the reason is recorded with the actor in the audit trail. */
export const LifecycleBody = z.strictObject({ reason: Reason });
export type LifecycleBody = z.infer<typeof LifecycleBody>;

export const TenantListQuery = z.strictObject({
  status: TenantStatus.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['createdAt', 'displayName']).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  cursor: Cursor.optional(),
  limit: ListLimit,
});
export type TenantListQuery = z.input<typeof TenantListQuery>;

export const TenantListPage = cursorPage(TenantView);
export type TenantListPage = z.infer<typeof TenantListPage>;

// ── Branches (tenant-owned) ──────────────────────────────────────────────────────────────────────────────────────────

export const BranchStatus = z.enum(['active', 'inactive']);
export type BranchStatus = z.infer<typeof BranchStatus>;

/** Unique within the tenant (spec §4 AC). Stored uppercase. */
export const BranchCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'letters, digits and hyphens, 2–20 characters');

const BranchFields = {
  name: z.string().trim().min(2).max(120),
  timezone: TimeZone,
  addressLine: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  region: z.string().trim().max(100).nullable().optional(),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2, e.g. IN')
    .nullable()
    .optional(),
};

export const BranchView = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  timezone: z.string(),
  addressLine: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  countryCode: z.string().nullable(),
  status: BranchStatus,
  deactivatedAt: IsoInstant.nullable(),
  deactivatedReason: z.string().nullable(),
  version: Version,
  createdAt: IsoInstant,
  updatedAt: IsoInstant,
});
export type BranchView = z.infer<typeof BranchView>;

export const CreateBranchBody = z.strictObject({ code: BranchCode, ...BranchFields });
export type CreateBranchBody = z.input<typeof CreateBranchBody>;

export const UpdateBranchBody = z
  .strictObject({
    version: Version,
    name: BranchFields.name.optional(),
    timezone: BranchFields.timezone.optional(),
    addressLine: BranchFields.addressLine,
    city: BranchFields.city,
    region: BranchFields.region,
    countryCode: BranchFields.countryCode,
  })
  .refine((b) => Object.keys(b).some((k) => k !== 'version'), 'nothing to change');
export type UpdateBranchBody = z.input<typeof UpdateBranchBody>;

export const BranchListQuery = z.strictObject({
  status: BranchStatus.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['name', 'code', 'createdAt']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  cursor: Cursor.optional(),
  limit: ListLimit,
});
export type BranchListQuery = z.input<typeof BranchListQuery>;

export const BranchListPage = cursorPage(BranchView);
export type BranchListPage = z.infer<typeof BranchListPage>;
