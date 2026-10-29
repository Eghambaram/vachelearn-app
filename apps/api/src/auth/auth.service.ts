import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import type { AuthSessionView, LoginBody } from '@vachelearn/contracts';
import type { z } from 'zod';
import type { RequestContext } from '../access/request-context';
import { MembershipsService } from '../access/memberships.service';
import { SupportSessionsService } from '../access/support-sessions.service';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/errors/api-exception';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { dummyHash, HashCapacityError, hashGate, verifyPassword } from './passwords';
import { hashSessionToken } from './session-tokens';
import { ipSubject, RateLimitService, type Limit } from './rate-limit.service';
import { SessionsService } from './sessions.service';

/*
 * Sign-in and sign-out (D-010; spec §5). Every failed sign-in — unknown email, wrong password, no password set yet,
 * address not verified, deactivated account — answers the same 401 after one Argon2id verification (spec §5 AC: same
 * response and timing class). Attempts are rate-limited per client IP, then per account (the user id when the address
 * is known, so case or Unicode variants share one bucket), before any hashing (D-086). Hashing runs through a small
 * gate (`HashGate`) so a sign-in flood cannot starve the rest of the API. Failures are logged without the address.
 */

type LoginInput = z.output<typeof LoginBody>;

export const LOGIN_LIMITS = {
  account: { name: 'login-account', max: 10, windowMs: 15 * 60_000 },
  ip: { name: 'login-ip', max: 50, windowMs: 15 * 60_000 },
} as const satisfies Record<string, Limit>;

export const invalidCredentials = () =>
  new ApiException(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionsService,
    private readonly rateLimits: RateLimitService,
    private readonly memberships: MembershipsService,
    private readonly support: SupportSessionsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(AuthService.name);
  }

  /** Prepare the dummy hash at start-up, so the first unknown-email sign-in is not slower than the rest. */
  async onModuleInit() {
    await dummyHash();
  }

  /**
   * Signs in; returns the cookie token (for the controller only) and the session view. A session the browser already
   * holds (`currentToken`) is ended, so signing in as someone else on a shared device closes the previous session.
   */
  async login(input: LoginInput, clientIp: string, requestId: string, currentToken?: string) {
    const email = input.email.normalize('NFKC').toLowerCase();
    await this.rateLimits.hit(LOGIN_LIMITS.ip, ipSubject(clientIp));

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        emailVerifiedAt: true,
        credential: { select: { passwordHash: true } },
      },
    });
    await this.rateLimits.hit(LOGIN_LIMITS.account, user ? `user:${user.id}` : `email:${email}`);

    // Always one verification, whether or not there is a password to check.
    const stored = user?.credential?.passwordHash ?? (await dummyHash());
    let matches: boolean;
    try {
      matches = await hashGate.run(() => verifyPassword(input.password, stored));
    } catch (err) {
      if (err instanceof HashCapacityError) {
        throw busy();
      }
      throw err;
    }
    if (!user?.credential || !matches || user.status !== 'active' || !user.emailVerifiedAt) {
      // Something to alert on, with no address or password: a keyed hash tells attempts on one account apart.
      this.logger.warn(
        { event: 'auth.sign_in_failed', subject: this.subjectId(email), requestId },
        'sign-in failed',
      );
      throw invalidCredentials();
    }

    const now = new Date();
    // One usable membership: the session starts in it (D-089); several: the user chooses.
    const membershipId = await this.memberships.defaultMembership(user.id);
    const created = await this.prisma.$transaction(async (tx) => {
      if (currentToken) {
        await tx.authSession.updateMany({
          where: { tokenHash: hashSessionToken(currentToken), endedAt: null },
          data: { endedAt: now, endReason: 'signed_out' },
        });
      }
      const result = await this.sessions.create(user.id, now, tx, membershipId);
      if (membershipId) {
        await this.memberships.recordAutoSelection(tx, user.id, membershipId, requestId);
      }
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'auth.signed_in',
        entityType: 'user',
        entityId: user.id,
        requestId,
      });
      return result;
    });
    const { activeTenant } = await this.memberships.accessFor(user.id, membershipId);
    const view: AuthSessionView = {
      user: { id: user.id, email: user.email, displayName: user.displayName },
      activeTenant,
      csrfToken: created.csrfToken,
      expiresAt: created.session.expiresAt.toISOString(),
    };
    return { token: created.token, expiresAt: created.session.expiresAt, view };
  }

  private subjectId(email: string) {
    return createHmac('sha256', this.config.sessionSecret)
      .update(`subject:${email}`)
      .digest('base64url')
      .slice(0, 16);
  }

  async me(ctx: RequestContext): Promise<AuthSessionView> {
    const session = requireSession(ctx);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { id: true, email: true, displayName: true },
    });
    const { activeTenant } = await this.memberships.accessFor(
      ctx.userId,
      session.activeMembershipId,
    );
    return {
      user,
      activeTenant,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async logout(ctx: RequestContext) {
    const session = requireSession(ctx);
    // A support session opened from this browser session ends with it (D-037).
    await this.support.endForSignOut(ctx, session.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.authSession.updateMany({
        where: { id: session.id, endedAt: null },
        data: { endedAt: new Date(), endReason: 'signed_out' },
      });
      await this.audit.record(tx, {
        actorUserId: ctx.userId,
        action: 'auth.signed_out',
        entityType: 'user',
        entityId: ctx.userId,
        requestId: ctx.requestId,
      });
    });
  }
}

/** These routes are about the caller's own browser session; other kinds of caller have none. */
function requireSession(ctx: RequestContext) {
  if (!ctx.session) throw new ApiException(401, 'UNAUTHENTICATED', 'Not signed in');
  return ctx.session;
}

/** Every hashing slot is taken (see `HashGate`): ask the client to come back shortly instead of queueing forever. */
export function busy() {
  return new ApiException(503, 'BUSY', 'The service is busy. Try again shortly.', undefined, {
    'Retry-After': '2',
  });
}
