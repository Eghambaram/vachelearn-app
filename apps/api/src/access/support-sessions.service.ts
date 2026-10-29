import { Injectable } from '@nestjs/common';
import type { SupportSessionView } from '@vachelearn/contracts';
import type { SupportSessionEndReason } from '../../generated/prisma/client';
import { AuditService, type Tx } from '../audit/audit.service';
import { ApiException } from '../common/errors/api-exception';
import { PrismaService } from '../prisma/prisma.service';
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
    return this.prisma.$transaction(async (tx) => {
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
      // One live session per staff member: opening a new one ends the previous one.
      const previous = await tx.platformSupportSession.findFirst({
        where: { staffUserId: ctx.userId, endedAt: null },
        select: { id: true, tenantId: true },
      });
      if (previous) await this.endIn(tx, previous, ctx, 'ended', now);
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
      await tx.authSession.updateMany({
        where: { id: authSessionId, userId: ctx.userId, endedAt: null },
        data: { supportSessionId: created.id },
      });
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
  }

  /** The caller's live support session (for the banner), or null. */
  async current(ctx: RequestContext): Promise<SupportSessionView | null> {
    const row = await this.prisma.platformSupportSession.findFirst({
      where: { staffUserId: ctx.userId, endedAt: null, expiresAt: { gt: new Date() } },
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
        staff: { select: { platformRoles: { where: { revokedAt: null }, select: { id: true } } } },
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
            : row.staff.platformRoles.length === 0
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

  /** Ends the live support session opened from a browser session that is signing out. */
  async endForSignOut(ctx: RequestContext, authSessionId: string) {
    await this.prisma.$transaction(async (tx) => {
      const live = await tx.platformSupportSession.findFirst({
        where: { authSessionId, staffUserId: ctx.userId, endedAt: null },
        select: { id: true, tenantId: true },
      });
      if (live) await this.endIn(tx, live, ctx, 'signed_out', new Date());
    });
  }

  private async endIn(
    tx: Tx,
    session: { id: string; tenantId: string },
    actor: { userId: string; requestId: string },
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
