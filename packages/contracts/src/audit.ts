import { z } from 'zod';
import { Cursor, IsoInstant, ListLimit, cursorPage } from './common';

/*
 * The tenant audit log (Slice 2.6a; D-099, D-109): `GET /api/v1/audit-events` for `audit.read`, newest first, the
 * caller's own tenant only (never a tenant id in the request). Branch-scoped readers see only events tagged with one of
 * their branches (D-109). Platform staff in a support session appear as "VacheLearn support" with their display name
 * and the session's reason — never their email (D-099). `before`/`after` are the safe subsets the API recorded.
 */

export const AuditActor = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user'), displayName: z.string() }),
  /** Platform staff inside a support session (D-099): name shown, email never. */
  z.object({ kind: z.literal('support'), displayName: z.string(), reason: z.string().nullable() }),
  /** VacheLearn staff acting on the tenant outside a support session (e.g. set-up, suspension): name, never email. */
  z.object({ kind: z.literal('staff'), displayName: z.string() }),
  /** Operator commands and background jobs. */
  z.object({ kind: z.literal('system') }),
]);
export type AuditActor = z.infer<typeof AuditActor>;

const SafeValues = z.record(z.string(), z.unknown()).nullable();

export const AuditEventView = z.object({
  id: z.uuid(),
  occurredAt: IsoInstant,
  action: z.string(),
  entityType: z.string(),
  entityId: z.uuid(),
  /**
   * What the record is, in words, resolved inside the tenant when the event is read: a member's name, a branch or job
   * role name, "Instructor · Asha" for a role… Null when it cannot be resolved (UX review 2.6a: never a short id).
   */
  entityLabel: z.string().nullable(),
  actor: AuditActor,
  branch: z.object({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
  reason: z.string().nullable(),
  before: SafeValues,
  after: SafeValues,
});
export type AuditEventView = z.infer<typeof AuditEventView>;

export const AuditEventListQuery = z.strictObject({
  /** Exact action key, e.g. `membership.deactivated`. */
  action: z
    .string()
    .regex(/^[a-z_]+\.[a-z_]+$/)
    .max(80)
    .optional(),
  /** Only what platform staff did or looked at in support sessions. */
  support: z.enum(['true', 'false']).optional(),
  cursor: Cursor.optional(),
  limit: ListLimit,
});
export type AuditEventListQuery = z.input<typeof AuditEventListQuery>;

export const AuditEventListPage = cursorPage(AuditEventView);
export type AuditEventListPage = z.infer<typeof AuditEventListPage>;
