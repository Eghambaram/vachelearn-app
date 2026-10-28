import { Injectable } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { MembershipsService } from '../access/memberships.service';
import type { ContextResolver, RequestContext } from '../access/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from './sessions.service';
import { sessionTokenFrom } from './session-tokens';

/**
 * Who is calling and what they may do, from the session cookie only (D-010): the user, their live platform roles, and
 * the session's active membership with its live role assignments (D-053, D-089). Checked on every request, so a
 * revoked role, a deactivated membership or a suspended tenant takes effect on the next request (D-049). A session
 * with no active tenant picks the user's only usable membership, if there is exactly one.
 */
@Injectable()
export class SessionResolver implements ContextResolver {
  constructor(
    private readonly sessions: SessionsService,
    private readonly memberships: MembershipsService,
    private readonly prisma: PrismaService,
  ) {}

  async resolve(req: IncomingMessage, requestId: string): Promise<RequestContext | null> {
    const token = sessionTokenFrom(req);
    if (!token) return null;
    const active = await this.sessions.resolve(token);
    if (!active) return null;

    let activeMembershipId = active.session.activeMembershipId;
    if (!activeMembershipId) {
      activeMembershipId = await this.memberships.defaultMembership(active.user.id);
      const chosen = activeMembershipId;
      if (chosen) {
        await this.prisma.$transaction(async (tx) => {
          const { count } = await tx.authSession.updateMany({
            where: { id: active.session.id, activeMembershipId: null, endedAt: null },
            data: { activeMembershipId: chosen },
          });
          // Audited once: a concurrent request that set it first wins, and this one records nothing.
          if (count === 1) {
            await this.memberships.recordAutoSelection(tx, active.user.id, chosen, requestId);
          }
        });
      }
    }
    const access = await this.memberships.accessFor(active.user.id, activeMembershipId);
    return {
      requestId,
      userId: active.user.id,
      platform: access.platform,
      tenant: access.tenant,
      ...(access.tenantBlocked ? { tenantBlocked: access.tenantBlocked } : {}),
      session: {
        id: active.session.id,
        csrfToken: active.csrfToken,
        expiresAt: active.session.expiresAt,
        activeMembershipId,
      },
    };
  }
}
