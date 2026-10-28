import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { ForgotPasswordBody, SetPasswordBody } from '@vachelearn/contracts';
import { PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import type { PasswordLinkPurpose } from '../../generated/prisma/client';
import { AuditService, type Tx } from '../audit/audit.service';
import { ApiException } from '../common/errors/api-exception';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { EmailJobs } from '../email/email-jobs';
import { PermanentJobError } from '../jobs/job-handlers';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { busy } from './auth.service';
import { HashCapacityError, hashGate, hashPassword, passwordProblem } from './passwords';
import { ipSubject, RateLimitService, type Limit } from './rate-limit.service';
import { hashSessionToken } from './session-tokens';

/*
 * Set-password and reset links (D-081, D-083, D-087, all Confirmed 2026-10-28).
 * - Requesting a link only queues an email job holding ids (`password-link:<requestId>`, one key per request).
 * - The token is minted when the email is composed: 32 random bytes, SHA-256 stored, older live link of the same
 *   purpose revoked in the same transaction (a partial unique index allows one live link per user and purpose).
 *   The link carries the token in its fragment (`#token=`), which browsers never send to a server.
 * - Consuming a link checks the policy (D-051), marks the link used (once), revokes the user's other live links, sets
 *   the password, verifies the address and ends every session (D-049) — one transaction, audited.
 */

export const PASSWORD_LINK_JOB = 'email.password_link';
export const LINK_LIFETIME_MS: Record<PasswordLinkPurpose, number> = {
  reset_password: 30 * 60_000,
  set_password: 7 * 24 * 60 * 60_000,
};

export const PASSWORD_LIMITS = {
  forgotIp: { name: 'forgot-ip', max: 20, windowMs: 60 * 60_000 },
  forgotAccount: { name: 'forgot-account', max: 3, windowMs: 60 * 60_000 },
  setIp: { name: 'set-password-ip', max: 30, windowMs: 15 * 60_000 },
} as const satisfies Record<string, Limit>;

const LinkJobPayload = z
  .object({
    userId: z.uuid(),
    requestId: z.uuid(),
    /** `setup`: a new account's first link; `forgot`: the user asked (reset, or set-password if none yet). */
    kind: z.enum(['setup', 'forgot']),
  })
  .strict();

export const invalidLink = () =>
  new ApiException(
    400,
    'INVALID_LINK',
    'This link is invalid or has expired. Ask for a new one from the sign-in page.',
  );

@Injectable()
export class PasswordLinksService implements OnModuleInit, OnApplicationShutdown {
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly emailJobs: EmailJobs,
    private readonly audit: AuditService,
    private readonly rateLimits: RateLimitService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(PasswordLinksService.name);
  }

  async onApplicationShutdown() {
    await this.settled();
  }

  onModuleInit() {
    this.emailJobs.define({
      type: PASSWORD_LINK_JOB,
      payload: LinkJobPayload,
      compose: async ({ userId, kind }, job, tx) => {
        // Everything is decided under the user's row lock, so a concurrent mint or consume for the same user waits
        // instead of failing or leaving the wrong kind of link live (security review 2.3c).
        await lockUser(tx, userId);
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { email: true, status: true, credential: { select: { userId: true } } },
        });
        // Re-checked at send time: the account may have changed since the request.
        if (!user || user.status !== 'active') {
          throw new PermanentJobError('The account is not active');
        }
        if (kind === 'setup' && user.credential) {
          throw new PermanentJobError('The password is already set');
        }
        const purpose: PasswordLinkPurpose = user.credential ? 'reset_password' : 'set_password';
        const token = await this.mint(tx, userId, purpose, job.id);
        return composeLink(this.config.WEB_ORIGIN, user.email, purpose, token);
      },
    });
  }

  /** Queues a new account's set-password email (D-083), in the caller's transaction. */
  async requestSetup(tx: Tx, userId: string) {
    await this.jobs.enqueue(
      {
        type: PASSWORD_LINK_JOB,
        businessKey: `password-link:${randomUUID()}`,
        payload: { userId, requestId: randomUUID(), kind: 'setup' },
      },
      tx,
    );
  }

  /**
   * "Forgot password": the same answer for everyone; an email only for an active account (D-087). The rate limits run
   * before the answer; the account lookup and the enqueue run after it, so the response time cannot tell a
   * registered address from an unknown one (security review 2.3c). `settled()` waits for it.
   */
  async requestForgot(input: z.output<typeof ForgotPasswordBody>, clientIp: string) {
    const email = input.email.normalize('NFKC').toLowerCase();
    await this.rateLimits.hit(PASSWORD_LIMITS.forgotIp, ipSubject(clientIp));
    // Keyed by the address for everyone (not the user id): the key itself must not need the lookup.
    await this.rateLimits.hit(PASSWORD_LIMITS.forgotAccount, `email:${email}`);
    const work = this.dispatchForgot(email)
      .catch((err: unknown) => this.logger.error({ err }, 'forgot-password dispatch failed'))
      .finally(() => this.pending.delete(work));
    this.pending.add(work);
  }

  /** Resolves when every forgot-password lookup started so far has finished (shutdown and tests). */
  async settled() {
    await Promise.all([...this.pending]);
  }

  private async dispatchForgot(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });
    if (!user || user.status !== 'active') return;
    const requestId = randomUUID();
    await this.jobs.enqueue({
      type: PASSWORD_LINK_JOB,
      businessKey: `password-link:${requestId}`,
      payload: { userId: user.id, requestId, kind: 'forgot' },
    });
  }

  /** Consumes a link and sets the password. */
  async setPassword(input: z.output<typeof SetPasswordBody>, clientIp: string, requestId: string) {
    await this.rateLimits.hit(PASSWORD_LIMITS.setIp, ipSubject(clientIp));
    const problem = passwordProblem(input.password);
    if (problem) {
      throw ApiException.validation([
        { field: 'password', code: problem, message: POLICY_MESSAGES[problem] },
      ]);
    }
    const now = new Date();
    const link = await this.prisma.passwordLink.findUnique({
      where: { tokenHash: hashSessionToken(input.token) },
      select: {
        id: true,
        userId: true,
        purpose: true,
        usedAt: true,
        revokedAt: true,
        expiresAt: true,
      },
    });
    if (!link || link.usedAt || link.revokedAt || link.expiresAt <= now) throw invalidLink();

    let passwordHash: string;
    try {
      passwordHash = await hashGate.run(() => hashPassword(input.password));
    } catch (err) {
      if (err instanceof HashCapacityError) throw busy();
      throw err;
    }

    await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, link.userId);
      // Used once: a second request racing this one finds the link already used.
      const used = await tx.passwordLink.updateMany({
        where: { id: link.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      const user = await tx.user.findUnique({
        where: { id: link.userId },
        select: { status: true, credential: { select: { userId: true } } },
      });
      if (used.count !== 1 || user?.status !== 'active') throw invalidLink();
      // A set-password link is for an account without a password; once one exists, only a 30-minute reset works.
      if (link.purpose === 'set_password' && user.credential) throw invalidLink();

      await tx.passwordLink.updateMany({
        where: { userId: link.userId, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.userCredential.upsert({
        where: { userId: link.userId },
        create: { userId: link.userId, passwordHash, changedAt: now },
        update: { passwordHash, changedAt: now },
      });
      await tx.user.updateMany({
        where: { id: link.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
      await tx.authSession.updateMany({
        where: { userId: link.userId, endedAt: null },
        data: { endedAt: now, endReason: 'password_changed' },
      });
      await this.audit.record(tx, {
        actorUserId: link.userId,
        action: link.purpose === 'set_password' ? 'auth.password_set' : 'auth.password_reset',
        entityType: 'user',
        entityId: link.userId,
        requestId,
      });
    });
  }

  /** Revokes the user's live link of this purpose and stores a new one; returns the token (never stored). */
  private async mint(tx: Tx, userId: string, purpose: PasswordLinkPurpose, jobId: string) {
    const now = new Date();
    await tx.passwordLink.updateMany({
      where: { userId, purpose, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    const token = randomBytes(32).toString('base64url');
    await tx.passwordLink.create({
      data: {
        userId,
        purpose,
        tokenHash: hashSessionToken(token),
        jobId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + LINK_LIFETIME_MS[purpose]),
      },
    });
    return token;
  }
}

/** Serialises link work per user: minting, consuming (`SELECT … FOR UPDATE` on the user row). */
async function lockUser(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT 1 FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
}

const POLICY_MESSAGES = {
  too_short: 'Use at least 12 characters',
  too_long: 'Use at most 128 characters',
  too_common: 'This password is too common. Choose one that is harder to guess',
} as const;

/** The email: no personal data in the subject (D-081 rules); the token only in the link's fragment. */
export function composeLink(
  webOrigin: string,
  to: string,
  purpose: PasswordLinkPurpose,
  token: string,
) {
  const reset = purpose === 'reset_password';
  const link = `${webOrigin}/${reset ? 'reset-password' : 'set-password'}#token=${token}`;
  return {
    to,
    subject: reset ? 'Reset your VacheLearn password' : 'Set your VacheLearn password',
    text: [
      reset
        ? 'Someone asked to reset the password for this VacheLearn account.'
        : 'A VacheLearn account was created for this email address.',
      '',
      `Open this link to ${reset ? 'choose a new' : 'set your'} password:`,
      link,
      '',
      reset
        ? 'The link works once and expires in 30 minutes. If you did not ask, ignore this email: your password stays the same.'
        : 'The link works once and expires in 7 days.',
    ].join('\n'),
  };
}
