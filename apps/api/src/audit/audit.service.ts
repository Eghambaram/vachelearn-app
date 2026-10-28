import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';

/** Prisma's transaction client: audit rows are written in the same transaction as the change they describe. */
export type Tx = Prisma.TransactionClient;

export type AuditEntry = {
  actorUserId: string | null;
  tenantId?: string | null;
  branchId?: string | null;
  /** `resource.verb_past` (CLAUDE.md), e.g. `tenant.suspended`. */
  action: string;
  entityType: string;
  entityId: string;
  requestId: string | null;
  reason?: string | null;
  /** Safe subset of changed fields only — never secrets or personal free text. */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

/**
 * Append-only audit trail (spec §18). The `audit_events` table rejects UPDATE and DELETE with a trigger, and the
 * branch reference is composite, so an event can never point at another tenant's branch.
 */
@Injectable()
export class AuditService {
  async record(tx: Tx, entry: AuditEntry) {
    await tx.auditEvent.create({
      data: {
        actorUserId: entry.actorUserId,
        tenantId: entry.tenantId ?? null,
        branchId: entry.branchId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        requestId: entry.requestId,
        reason: entry.reason ?? null,
        before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}

/**
 * The fields of `patch` that differ from `before`, for a compact before/after audit pair. Audit rows are insert-only
 * and can never be erased, so personal fields (e.g. a contact email) are recorded only as changed, never by value.
 */
export function changedFields<T extends Record<string, unknown>>(
  before: T,
  patch: Partial<T>,
  { personal = [] }: { personal?: readonly (keyof T)[] } = {},
) {
  const keys = (Object.keys(patch) as (keyof T)[]).filter(
    (k) => patch[k] !== undefined && patch[k] !== before[k],
  );
  const value = (k: keyof T, v: unknown) => (personal.includes(k) ? '[changed]' : (v ?? null));
  return {
    before: Object.fromEntries(keys.map((k) => [k, value(k, before[k])])),
    after: Object.fromEntries(keys.map((k) => [k, value(k, patch[k])])),
    changed: keys.length > 0,
  };
}
