import { Inject, Injectable } from '@nestjs/common';
import type { AuthSession, SessionEndReason, User } from '../../generated/prisma/client';
import type { Tx } from '../audit/audit.service';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { csrfTokenFor, hashSessionToken, newSessionToken } from './session-tokens';

/*
 * Server-side sessions (D-010). Checked on every request (D-049: deactivation and, later, password change and tenant
 * suspension take effect on the next request): ended, past its 7-day expiry or idle for 8 hours (D-084) → the session
 * is ended with a reason and the caller is anonymous. `last_seen_at` is written at most every 5 minutes, not on every
 * request.
 */

export const IDLE_TIMEOUT_MS = 8 * 60 * 60_000;
export const MAX_LIFETIME_MS = 7 * 24 * 60 * 60_000;
const TOUCH_EVERY_MS = 5 * 60_000;

export type ActiveSession = {
  session: AuthSession;
  user: Pick<User, 'id' | 'email' | 'displayName'>;
  csrfToken: string;
};

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Starts a session (in the caller's transaction); returns the cookie token (never stored) and the row. */
  async create(
    userId: string,
    now = new Date(),
    tx: Tx = this.prisma,
    activeMembershipId: string | null = null,
  ) {
    const token = newSessionToken();
    const session = await tx.authSession.create({
      data: {
        userId,
        tokenHash: hashSessionToken(token),
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + MAX_LIFETIME_MS),
        activeMembershipId,
      },
    });
    return { token, session, csrfToken: this.csrfToken(session.id) };
  }

  /** The live session behind a cookie token, or null (ending it when it has run out or its user is deactivated). */
  async resolve(token: string, now = new Date()): Promise<ActiveSession | null> {
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: { select: { id: true, email: true, displayName: true, status: true } } },
    });
    if (!session || session.endedAt) return null;

    const reason: SessionEndReason | null =
      session.user.status !== 'active'
        ? 'user_deactivated'
        : now >= session.expiresAt
          ? 'expired'
          : now.getTime() - session.lastSeenAt.getTime() >= IDLE_TIMEOUT_MS
            ? 'idle_timeout'
            : null;
    if (reason) {
      await this.end(session.id, reason, now);
      return null;
    }
    if (now.getTime() - session.lastSeenAt.getTime() >= TOUCH_EVERY_MS) {
      await this.prisma.authSession.updateMany({
        where: { id: session.id, endedAt: null },
        data: { lastSeenAt: now },
      });
    }
    const { user, ...row } = session;
    return {
      session: row,
      user: { id: user.id, email: user.email, displayName: user.displayName },
      csrfToken: this.csrfToken(session.id),
    };
  }

  /** Ends one session (idempotent: an already-ended session keeps its first reason). */
  async end(sessionId: string, reason: SessionEndReason, now = new Date()) {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, endedAt: null },
      data: { endedAt: now, endReason: reason },
    });
  }

  /** Ends every live session of a user (deactivation, password change). Returns how many ended. */
  async endAllForUser(userId: string, reason: SessionEndReason, now = new Date()) {
    const { count } = await this.prisma.authSession.updateMany({
      where: { userId, endedAt: null },
      data: { endedAt: now, endReason: reason },
    });
    return count;
  }

  private csrfToken(sessionId: string) {
    return csrfTokenFor(this.config.sessionSecret, sessionId);
  }
}
