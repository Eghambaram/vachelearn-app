import { Injectable } from '@nestjs/common';
import type { SupportSessionView } from '@vachelearn/contracts';
import type { SupportSessionEndReason } from '../../generated/prisma/client';
import { AuditService, type Tx } from '../audit/audit.service';
import { ApiException } from '../common/errors/api-exception';
import { isUniqueViolation } from '../prisma/errors';
import { PrismaService } from '../prisma/prisma.service';
import { platformGrants, type PlatformRole } from './permissions';
import type { RequestContext } from './request-context';

/*
 * Platform support sessions (Slice 2.4c; D-037 Confirmed, D-098 Confirmed): platform staff's only way into a tenant.
 * Explicit, reason required, read-only (the matrix's SS permissions), 60 minutes at most, bound to the browser session
 * that opened it, one live per staff member. Opening, ending and every request inside are audited with the tenant and
 * the session id, so the tenant's audit log shows them. Active or suspended tenants only; archiving the tenant,
 * signing out or losing the platform role ends it.
 */

export const SUPPORT_SESSION_MS = 60 * 60_000;

const VIEW_SELECT = {
  id: true,
  reason: true,
  startedAt: true,
  expiresAt: true,
  tenant: { select: { id: true, slug: true, displayName: true } },
} as const;

type ViewRow = {
  id: string;
  reason: string;
  startedAt: Date;
  expiresAt: Date;
  tenant: { id: string; slug: string; displayName: string };
};

const toView = (s: ViewRow): SupportSessionView => ({
  id: s.id,
  tenant: s.tenant,
  reason: s.reason,
  startedAt: s.startedAt.toISOString(),
  expiresAt: s.expiresAt.toISOString(),
});

@Injectable()
export class SupportSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async start(ctx: RequestContext, tenantId: string, reason: string): Promise<SupportSessionView> {
    const authSessionId = requireBrowserSession(ctx);
    const now = new Date();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.findUnique({
          where: { id: tenantId },
          select: { status: true },
        });
        if (!tenant) throw ApiException.notFound();
        if (tenant.status === 'archived') {
          throw new ApiException(
            409,
            'INVALID_STATE',
            'An archived tenant cannot be opened for support',
          );
        }
        // One live session per staff member: opening a new one ends the previous one (or records that it expired).
        const previous = await tx.platformSupportSession.findFirst({
          where: { staffUserId: ctx.userId, endedAt: null },
          select: { id: true, tenantId: true, expiresAt: true },
        });
        if (previous) {
          await this.endIn(tx, previous, ctx, previous.expiresAt <= now ? 'expired' : 'ended', now);
        }
        const created = await tx.platformSupportSession.create({
          data: {
            staffUserId: ctx.userId,
            tenantId,
            authSessionId,
            reason,
            startedAt: now,
            expiresAt: new Date(now.getTime() + SUPPORT_SESSION_MS),
          },
          select: VIEW_SELECT,
        });
        const bound = await tx.authSession.updateMany({
          where: { id: authSessionId, userId: ctx.userId, endedAt: null },
          data: { supportSessionId: created.id },
        });
        // The browser session ended meanwhile (signed out in another tab): open nothing.
        if (bound.count !== 1) throw new ApiException(401, 'UNAUTHENTICATED', 'Not signed in');
        await this.audit.record(tx, {
          actorUserId: ctx.userId,
          tenantId,
          action: 'support_session.started',
          entityType: 'support_session',
          entityId: created.id,
          requestId: ctx.requestId,
          reason,
          supportSessionId: created.id,
        });
        return toView(created);
      });
    } catch (err) {
      // Two starts at once from the same staff member: one wins, the other is told so (never a 500).
      if (isUniqueViolation(err, 'platform_support_sessions_one_live')) {
        throw new ApiException(
          409,
          'CONFLICT',
          'Another support session was just opened. Try again.',
        );
      }
      throw err;
    }
  }

  /** The caller's live support session (for the banner), or null. */
  async current(ctx: RequestContext): Promise<SupportSessionView | null> {
    if (!ctx.session) return null;
    // Bound to this browser session: another tab or device of the same staff member is not in support.
    const row = await this.prisma.platformSupportSession.findFirst({
      where: {
        staffUserId: ctx.userId,
        authSessionId: ctx.session.id,
        endedAt: null,
        expiresAt: { gt: new Date() },
        tenant: { status: { not: 'archived' } },
      },
      select: VIEW_SELECT,
    });
    return row ? toView(row) : null;
  }

  async end(ctx: RequestContext, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const live = await tx.platformSupportSession.findFirst({
        where: { id, staffUserId: ctx.userId, endedAt: null },
        select: { id: true, tenantId: true },
      });
      if (!live) throw ApiException.notFound();
      await this.endIn(tx, live, ctx, 'ended', new Date());
    });
  }

  /**
   * The live support session a browser session is in, checked on every request: ended, past 60 minutes, opened from
   * another browser session, tenant archived, or the staff member no longer platform staff → ended now, and null.
   */
  async live(
    authSessionId: string,
    staffUserId: string,
    supportSessionId: string,
    requestId: string,
  ) {
    const now = new Date();
    const row = await this.prisma.platformSupportSession.findFirst({
      where: { id: supportSessionId, staffUserId, endedAt: null },
      select: {
        id: true,
        tenantId: true,
        authSessionId: true,
        expiresAt: true,
        tenant: { select: { status: true } },
        staff: {
          select: { platformRoles: { where: { revokedAt: null }, select: { role: true } } },
        },
      },
    });
    const ending: SupportSessionEndReason | null = !row
      ? null
      : row.authSessionId !== authSessionId
        ? null
        : now >= row.expiresAt
          ? 'expired'
          : row.tenant.status === 'archived'
            ? 'tenant_archived'
            : !platformGrants(row.staff.platformRoles.map((r) => r.role as PlatformRole)).has(
                  'platform.support_access.start',
                )
              ? 'staff_role_revoked'
              : null;
    if (!row || row.authSessionId !== authSessionId || ending) {
      await this.prisma.$transaction(async (tx) => {
        if (row && ending) {
          await this.endIn(tx, row, { userId: staffUserId, requestId }, ending, now);
        }
        await tx.authSession.updateMany({
          where: { id: authSessionId, supportSessionId },
          data: { supportSessionId: null },
        });
      });
      return null;
    }
    return { sessionId: row.id, tenantId: row.tenantId };
  }

  /**
   * Ends the live support sessions opened from browser sessions that are ending — sign-out, idle or absolute expiry,
   * password change, deactivation — inside the caller's transaction, so the tenant's log always gets an end event.
   */
  async endForAuthSessions(
    tx: Tx,
    where: { authSessionId: string } | { staffUserId: string },
    actor: { userId: string; requestId: string | null },
  ) {
    const live = await tx.platformSupportSession.findMany({
      where: { ...where, endedAt: null },
      select: { id: true, tenantId: true },
    });
    for (const session of live) await this.endIn(tx, session, actor, 'signed_out', new Date());
  }

  /** Ends every live support session into a tenant that is being archived (same transaction). */
  async endForTenant(
    tx: Tx,
    tenantId: string,
    actor: { userId: string; requestId: string | null },
  ) {
    const live = await tx.platformSupportSession.findMany({
      where: { tenantId, endedAt: null },
      select: { id: true, tenantId: true },
    });
    for (const session of live) await this.endIn(tx, session, actor, 'tenant_archived', new Date());
  }

  /** Closes support sessions that ran out without another request (abandoned): `expired`, audited. */
  async sweepExpired(now = new Date()) {
    const due = await this.prisma.platformSupportSession.findMany({
      where: { endedAt: null, expiresAt: { lte: now } },
      select: { id: true, tenantId: true, staffUserId: true },
      take: 100,
    });
    for (const session of due) {
      await this.prisma.$transaction((tx) =>
        this.endIn(tx, session, { userId: session.staffUserId, requestId: null }, 'expired', now),
      );
    }
    return due.length;
  }

  private async endIn(
    tx: Tx,
    session: { id: string; tenantId: string },
    actor: { userId: string; requestId: string | null },
    reason: SupportSessionEndReason,
    now: Date,
  ) {
    const { count } = await tx.platformSupportSession.updateMany({
      where: { id: session.id, endedAt: null },
      data: { endedAt: now, endReason: reason },
    });
    await tx.authSession.updateMany({
      where: { supportSessionId: session.id },
      data: { supportSessionId: null },
    });
    if (count === 1) {
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        tenantId: session.tenantId,
        action: reason === 'expired' ? 'support_session.expired' : 'support_session.ended',
        entityType: 'support_session',
        entityId: session.id,
        requestId: actor.requestId,
        reason,
        supportSessionId: session.id,
      });
    }
  }
}

function requireBrowserSession(ctx: RequestContext) {
  if (!ctx.session) throw new ApiException(401, 'UNAUTHENTICATED', 'Not signed in');
  return ctx.session.id;
}
