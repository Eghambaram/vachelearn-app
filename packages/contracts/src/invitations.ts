import { z } from 'zod';
import { TenantRoleKey } from './auth';
import { Cursor, IsoInstant, ListLimit, cursorPage } from './common';
import { LifecycleBody } from './tenancy';

/*
 * Invitations (Slice 3.1; spec §5; D-050, D-115, D-116; matrix `invitation.*`). A Tenant Admin invites anyone with any
 * tenant role; a Branch Admin invites only Learners and Instructors, only to its own branches (the granting rules of
 * role assignment). One pending invitation per address and tenant; it expires after the tenant's validity (D-050,
 * default 7 days). The emailed link carries a single-use token in its fragment (`/accept-invite#token=…`); only its
 * hash is stored. Joining only: an address that already has a membership here is refused (D-115). After accepting, a
 * new person signs in; an existing account accepts while signed in as the invited address (D-116).
 */

/** Shown for an invitation: `expired` is derived (pending past its expiry). */
export const InvitationStatus = z.enum(['pending', 'expired', 'accepted', 'revoked']);
export type InvitationStatus = z.infer<typeof InvitationStatus>;

const BranchRef = z.object({ id: z.uuid(), code: z.string(), name: z.string() });

export const InvitationView = z.object({
  id: z.uuid(),
  email: z.string(),
  role: TenantRoleKey,
  branch: BranchRef.nullable(),
  status: InvitationStatus,
  expiresAt: IsoInstant,
  createdAt: IsoInstant,
  /** The inviter's display name (never an id). Nullable for a future account-removal rule; always set today. */
  invitedBy: z.object({ displayName: z.string() }).nullable(),
  lastSentAt: IsoInstant.nullable(),
  acceptedAt: IsoInstant.nullable(),
  revokedAt: IsoInstant.nullable(),
  revokedReason: z.string().nullable(),
  /** Whether this caller may resend or cancel it (a Branch Admin: Learner/Instructor on its branches). */
  canManage: z.boolean(),
});
export type InvitationView = z.infer<typeof InvitationView>;

export const InvitationListQuery = z.strictObject({
  status: InvitationStatus.optional(),
  /** Narrows the caller's branch scope; never widens it. */
  branchId: z.uuid().optional(),
  /** Part of the invited address. */
  search: z.string().trim().min(1).max(100).optional(),
  cursor: Cursor.optional(),
  limit: ListLimit,
});
export type InvitationListQuery = z.input<typeof InvitationListQuery>;
export const InvitationListPage = cursorPage(InvitationView);
export type InvitationListPage = z.infer<typeof InvitationListPage>;

export const InvitationEmail = z
  .email()
  .max(254)
  .transform((e) => e.normalize('NFKC').toLowerCase());

/** `POST /invitations`. `branchId` null = the whole tenant (Tenant Admin only; a Branch Admin role needs a branch). */
export const CreateInvitationBody = z.strictObject({
  email: InvitationEmail,
  role: TenantRoleKey,
  branchId: z.uuid().nullable(),
});
export type CreateInvitationBody = z.input<typeof CreateInvitationBody>;

/** `POST /invitations/:id/revoke`: a reason is always required. */
export const RevokeInvitationBody = LifecycleBody;

/** The emailed token: 32 random bytes, base64url. */
export const InvitationToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** `POST /invitations/preview` (public): what the accept page shows for a live link; any other → 400 INVALID_LINK. */
export const InvitationPreviewBody = z.strictObject({ token: InvitationToken });
export const InvitationPreview = z.object({
  organisation: z.string(),
  role: TenantRoleKey,
  branch: z.string().nullable(),
  /** The invited address (the link was sent there); an existing account must sign in as it (D-116). */
  email: z.string(),
  /** True when an account exists for the address: the page asks to sign in instead of creating one. */
  accountExists: z.boolean(),
  expiresAt: IsoInstant,
});
export type InvitationPreview = z.infer<typeof InvitationPreview>;

/** `POST /invitations/accept` (public): a new account — name and password (policy D-051). Then sign in (D-116). */
export const AcceptInvitationBody = z.strictObject({
  token: InvitationToken,
  displayName: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(256),
});
export type AcceptInvitationBody = z.input<typeof AcceptInvitationBody>;

/** `POST /me/invitations/accept` (signed in as the invited address). */
export const AcceptExistingInvitationBody = z.strictObject({ token: InvitationToken });

export const AcceptedInvitation = z.object({
  organisation: z.string(),
  /** The new membership: the signed-in user can switch to it (`POST /auth/session/tenant`). */
  membershipId: z.uuid(),
});
export type AcceptedInvitation = z.infer<typeof AcceptedInvitation>;
