import { z } from 'zod';
import { IsoInstant } from './common';
import { Reason } from './tenancy';

/*
 * Platform support sessions (Slice 2.4c; D-037, D-098). Platform staff open one into a tenant with a reason; for at
 * most 60 minutes their tenant requests run read-only with the matrix's support (SS) permissions, every request audited
 * with the session id. Starting names the tenant (a platform action); inside the session the tenant comes from the
 * session, never from a request.
 */

export const StartSupportSessionBody = z.object({ tenantId: z.uuid(), reason: Reason }).strict();

export const SupportSessionView = z.object({
  id: z.uuid(),
  tenant: z.object({ id: z.uuid(), slug: z.string(), displayName: z.string() }),
  reason: z.string(),
  startedAt: IsoInstant,
  expiresAt: IsoInstant,
});
export type SupportSessionView = z.infer<typeof SupportSessionView>;

/** `GET /platform/support-sessions/current`: the caller's live support session, or null. */
export const CurrentSupportSession = z.object({ data: SupportSessionView.nullable() });
export type CurrentSupportSession = z.infer<typeof CurrentSupportSession>;
