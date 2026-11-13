import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type {
  AcceptedInvitation,
  AcceptExistingInvitationBody,
  AcceptInvitationBody,
  CreateInvitationBody,
  InvitationListPage,
  InvitationListQuery,
  InvitationPreview,
  InvitationPreviewBody,
  InvitationStatus,
  InvitationView,
} from '@vachelearn/contracts';
import { z } from 'zod';
import type { Prisma, TenantRole as DbTenantRole } from '../../generated/prisma/client';
import {
  BRANCH_ADMIN_ASSIGNABLE,
  BRANCH_ONLY_ROLES,
  TENANT_ONLY_ROLES,
  tenantGrants,
  type TenantRole,
} from '../access/permissions';
import { liveReach, reachFor, reachFromContext, type Reach } from '../access/reach';
import type { RequestContext } from '../access/request-context';
import { isPlatformStaff, lockTenant } from '../access/tenant-admins';
import { AuditService, type Tx } from '../audit/audit.service';
import { busy } from '../auth/auth.service';
import { HashCapacityError, hashGate, hashPassword, passwordProblem } from '../auth/passwords';
import { ipSubject, RateLimitService, type Limit } from '../auth/rate-limit.service';
import { hashSessionToken } from '../auth/session-tokens';
import { ApiException } from '../common/errors/api-exception';
import { afterCursor, CURSORS, Cursors, queryKey } from '../common/pagination/keyset';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { EmailJobs } from '../email/email-jobs';
import { PermanentJobError } from '../jobs/job-handlers';
import { JobsService } from '../jobs/jobs.service';
import { DEFAULT_INVITATION_EXPIRY_DAYS } from '../people/tenant-settings.service';
import { isUniqueViolation } from '../prisma/errors';
import { PrismaService } from '../prisma/prisma.service';
import { NewUser } from '../users/users.service';

/*
 * Invitations (Slice 3.1; spec §5; D-050, D-115, D-116). Inviting follows the granting rules of role assignment (matrix
 * "Granting rules"): a Tenant Admin invites with any tenant role; a Branch Admin only Learner or Instructor on its own
 * branches. Joining only (D-115): an address with a membership here is refused. A platform-staff or closed account
 * (D-037) never joins, but inviting one is answered like a fresh address and no email is sent (D-118).
 *
 * The emailed link (D-081 pattern): the job payload holds ids only; `compose` mints a 32-byte token when the email is
 * built and stores only its SHA-256. A resend clears the stored hash at once (the old link stops working) and bumps
 * `send_count`, so a job for an earlier send never mints. Accepting claims the invitation with a conditional update in
 * the same transaction that creates the account/membership/role, so a link is used exactly once; the inviter's
 * authority is re-checked then too. The link alone never opens a session (D-116).
 */

export const INVITATION_JOB = 'email.invitation';

/**
 * D-117 (Proposed; security review 3.1): sending per inviter and per tenant, resends per invitation; link use per link
 * (the main limit: crews behind one NAT address must not share a budget) with a high per-network flood cap.
 */
export const INVITATION_LIMITS = {
  send: { name: 'invite-send', max: 100, windowMs: 60 * 60_000 },
  sendTenant: { name: 'invite-send-tenant', max: 300, windowMs: 60 * 60_000 },
  resendInvitation: { name: 'invite-resend', max: 5, windowMs: 24 * 60 * 60_000 },
  linkToken: { name: 'invite-link-token', max: 10, windowMs: 15 * 60_000 },
  link: { name: 'invite-link-ip', max: 300, windowMs: 15 * 60_000 },
} as const satisfies Record<string, Limit>;

const JobPayload = z
  .object({ invitationId: z.uuid(), send: z.number().int().min(1), requestId: z.uuid() })
  .strict();

const DAY_MS = 24 * 60 * 60_000;

const VIEW_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  expiresAt: true,
  createdAt: true,
  lastSentAt: true,
  acceptedAt: true,
  revokedAt: true,
  revokedReason: true,
  branch: { select: { id: true, code: true, name: true } },
  createdBy: { select: { displayName: true } },
} as const satisfies Prisma.InvitationSelect;

type Row = Prisma.InvitationGetPayload<{ select: typeof VIEW_SELECT }>;

export const invalidInvitation = () =>
  new ApiException(
    400,
    'INVALID_LINK',
    'This invitation is invalid or has expired. Ask the person who invited you for a new one.',
  );

const forbidden = (message: string) => new ApiException(403, 'FORBIDDEN', message);

function tenantOf(ctx: RequestContext) {
  if (!ctx.tenant) throw ApiException.notFound();
  return ctx.tenant.tenantId;
}

function statusOf(row: { status: string; expiresAt: Date }, now: Date): InvitationStatus {
  if (row.status === 'pending') return row.expiresAt <= now ? 'expired' : 'pending';
  return row.status as InvitationStatus;
}

/** May a reach act on an invitation (resend, cancel)? A Branch Admin: only roles it could grant, on its branches. */
function manages(reach: Reach | null, row: { role: string; branch: { id: string } | null }) {
  if (!reach) return false;
  if (reach.kind === 'tenant') return true;
  return (
    row.branch !== null &&
    reach.branchIds.has(row.branch.id) &&
    BRANCH_ADMIN_ASSIGNABLE.includes(row.role as TenantRole)
  );
}

function toView(row: Row, now: Date, manageReach: Reach | null): InvitationView {
  const status = statusOf(row, now);
  return {
    id: row.id,
    email: row.email,
    role: row.role as TenantRole,
    branch: row.branch,
    status,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    invitedBy: { displayName: row.createdBy.displayName },
    lastSentAt: row.lastSentAt?.toISOString() ?? null,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revokedReason: row.revokedReason,
    canManage: (status === 'pending' || status === 'expired') && manages(manageReach, row),
  };
}

@Injectable()
export class InvitationsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
    private readonly emailJobs: EmailJobs,
    private readonly rateLimits: RateLimitService,
    @Inject(CURSORS) private readonly cursors: Cursors,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit() {
    this.emailJobs.define({
      type: INVITATION_JOB,
      payload: JobPayload,
      compose: async ({ invitationId, send }, _job, tx) => {
        await tx.$queryRaw`SELECT 1 FROM invitations WHERE id = ${invitationId}::uuid FOR UPDATE`;
        const inv = await tx.invitation.findUnique({
          where: { id: invitationId },
          select: {
            email: true,
            role: true,
            status: true,
            sendCount: true,
            expiresAt: true,
            tenant: { select: { displayName: true, status: true } },
            branch: { select: { name: true } },
          },
        });
        // Re-checked at send time: cancelled, accepted, superseded by a resend or expired → nothing to send.
        if (!inv || inv.status !== 'pending')
          throw new PermanentJobError('The invitation is closed');
        if (inv.sendCount !== send) throw new PermanentJobError('Superseded by a resend');
        if (inv.expiresAt <= new Date()) throw new PermanentJobError('The invitation has expired');
        if (inv.tenant.status !== 'active') throw new PermanentJobError('The tenant is not active');
        // D-118: invited like anyone else, but a platform-staff or closed account is never sent a link.
        if (await cannotJoin(tx, inv.email)) throw new PermanentJobError('The address cannot join');
        const token = randomBytes(32).toString('base64url');
        await tx.invitation.update({
          where: { id: invitationId },
          data: { tokenHash: hashSessionToken(token), lastSentAt: new Date() },
        });
        return composeInvitation(this.config.WEB_ORIGIN, {
          to: inv.email,
          organisation: inv.tenant.displayName,
          role: inv.role as TenantRole,
          branch: inv.branch?.name ?? null,
          expiresAt: inv.expiresAt,
          token,
        });
      },
    });
  }

  // ── Inviters (tenant routes) ─────────────────────────────────────────────────────────────────────────────────────

  async list(
    ctx: RequestContext,
    input: z.output<typeof InvitationListQuery>,
  ): Promise<InvitationListPage> {
    const tenantId = tenantOf(ctx);
    const reach = reachFromContext(ctx);
    const { cursor, ...query } = input;
    const now = new Date();
    const scope = reach.kind === 'tenant' ? 'ALL' : [...reach.branchIds].sort();
    const key = queryKey([
      'invitations',
      tenantId,
      scope,
      query.status ?? '',
      query.branchId ?? '',
      query.search ?? '',
      query.limit,
    ]);
    const position = cursor ? this.cursors.decode(cursor, key, 'instant') : null;
    const statusWhere: Prisma.InvitationWhereInput =
      query.status === 'pending'
        ? { status: 'pending', expiresAt: { gt: now } }
        : query.status === 'expired'
          ? { status: 'pending', expiresAt: { lte: now } }
          : query.status
            ? { status: query.status }
            : {};
    const rows = await this.prisma.invitation.findMany({
      where: {
        AND: [
          { tenantId },
          // A branch-scoped reader sees invitations to its branches only; a filter narrows, never widens.
          reach.kind === 'branches' ? { branchId: { in: [...reach.branchIds] } } : {},
          query.branchId ? { branchId: query.branchId } : {},
          statusWhere,
          query.search ? { email: { contains: query.search, mode: 'insensitive' } } : {},
          position ? afterCursor('createdAt', 'desc', position.value, position.id) : {},
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: VIEW_SELECT,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const manageReach = ctx.support ? null : reachFor(ctx, 'invitation.revoke');
    return {
      data: page.map((r) => toView(r, now, manageReach)),
      page: {
        limit: query.limit,
        nextCursor:
          rows.length > query.limit && last
            ? this.cursors.encode(last.createdAt.toISOString(), last.id, key)
            : null,
      },
    };
  }

  async create(
    ctx: RequestContext,
    input: z.output<typeof CreateInvitationBody>,
  ): Promise<InvitationView> {
    const tenantId = tenantOf(ctx);
    if (BRANCH_ONLY_ROLES.includes(input.role) && !input.branchId) {
      throw ApiException.validation([
        { field: 'branchId', code: 'required', message: 'A Branch Admin needs a branch' },
      ]);
    }
    if (TENANT_ONLY_ROLES.includes(input.role) && input.branchId) {
      throw ApiException.validation([
        {
          field: 'branchId',
          code: 'not_allowed',
          message: 'A Tenant Admin is for the whole tenant',
        },
      ]);
    }
    await this.rateLimits.hit(INVITATION_LIMITS.send, `user:${ctx.userId}`);
    await this.rateLimits.hit(INVITATION_LIMITS.sendTenant, `tenant:${tenantId}`);
    const now = new Date();
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await lockTenant(tx, tenantId);
        const reach = await liveReach(tx, ctx, tenantId, 'invitation.create');
        if (reach.kind === 'branches') {
          if (!BRANCH_ADMIN_ASSIGNABLE.includes(input.role)) {
            throw forbidden('A Branch Admin can invite only Learners or Instructors');
          }
          if (!input.branchId) {
            throw ApiException.validation([
              { field: 'branchId', code: 'required', message: 'Choose one of your branches' },
            ]);
          }
          if (!reach.branchIds.has(input.branchId)) throw ApiException.notFound();
        }
        if (input.branchId) {
          const branch = await tx.branch.findFirst({
            where: { id: input.branchId, tenantId, status: 'active' },
            select: { id: true },
          });
          if (!branch) throw ApiException.notFound();
        }
        await this.assertCanJoin(tx, tenantId, input.email, 'invite');

        const pending = await tx.invitation.findFirst({
          where: { tenantId, email: input.email, status: 'pending' },
          select: {
            id: true,
            expiresAt: true,
            branchId: true,
            role: true,
            branch: { select: { id: true } },
          },
        });
        // Only a caller who could cancel an expired invitation may replace it (isolation audit 3.1): a Branch Admin
        // never closes another branch's or a tenant-wide invitation this way.
        if (pending && (pending.expiresAt > now || !manages(reach, pending))) {
          throw new ApiException(
            409,
            'INVITATION_PENDING',
            'This address already has a pending invitation. Resend it instead.',
          );
        }
        if (pending) {
          // An expired one is closed first: the new invitation replaces it (one pending per address, D-050).
          await this.close(
            tx,
            ctx,
            tenantId,
            pending.id,
            pending.branchId,
            'Replaced by a new invitation',
          );
        }
        const days = await this.expiryDays(tx, tenantId);
        const created = await tx.invitation.create({
          data: {
            tenantId,
            email: input.email,
            role: input.role as DbTenantRole,
            branchId: input.branchId,
            expiresAt: new Date(now.getTime() + days * DAY_MS),
            createdById: ctx.userId,
          },
          select: VIEW_SELECT,
        });
        await this.audit.record(tx, {
          actorUserId: ctx.userId,
          tenantId,
          branchId: input.branchId,
          action: 'invitation.created',
          entityType: 'invitation',
          entityId: created.id,
          requestId: ctx.requestId,
          after: {
            role: input.role,
            branchId: input.branchId,
            expiresAt: created.expiresAt.toISOString(),
          },
        });
        await this.enqueueEmail(tx, created.id, 1);
        return created;
      });
      return toView(row, now, reachFor(ctx, 'invitation.revoke'));
    } catch (err) {
      // The same address invited twice at once: one wins, the other is told so (never a 500).
      if (isUniqueViolation(err, 'invitations_one_pending_per_email')) {
        throw new ApiException(
          409,
          'INVITATION_PENDING',
          'This address already has a pending invitation. Resend it instead.',
        );
      }
      throw err;
    }
  }

  async resend(ctx: RequestContext, id: string): Promise<InvitationView> {
    const tenantId = tenantOf(ctx);
    await this.rateLimits.hit(INVITATION_LIMITS.send, `user:${ctx.userId}`);
    await this.rateLimits.hit(INVITATION_LIMITS.sendTenant, `tenant:${tenantId}`);
    await this.rateLimits.hit(INVITATION_LIMITS.resendInvitation, `invitation:${id}`);
    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      const reach = await liveReach(tx, ctx, tenantId, 'invitation.create');
      const inv = await this.manageable(tx, tenantId, reach, id);
      await this.assertCanJoin(tx, tenantId, inv.email, 'invite');
      // The link stays the original inviter's grant (re-checked at acceptance): never send one that cannot work.
      if (!(await this.inviterStillMay(tx, { tenantId, ...inv }))) {
        throw new ApiException(
          409,
          'INVITER_CANNOT_GRANT',
          'The person who sent this invitation can no longer grant this role. Cancel it and send a new one.',
        );
      }
      const days = await this.expiryDays(tx, tenantId);
      // The old link stops working now (hash cleared); the new one is minted by the job for this send only.
      const updated = await tx.invitation.updateMany({
        where: { id, tenantId, status: 'pending' },
        data: {
          tokenHash: null,
          sendCount: { increment: 1 },
          expiresAt: new Date(now.getTime() + days * DAY_MS),
        },
      });
      if (updated.count !== 1) throw notPending();
      const fresh = await tx.invitation.findUniqueOrThrow({
        where: { id },
        select: { ...VIEW_SELECT, sendCount: true },
      });
      await this.audit.record(tx, {
        actorUserId: ctx.userId,
        tenantId,
        branchId: fresh.branch?.id ?? null,
        action: 'invitation.resent',
        entityType: 'invitation',
        entityId: id,
        requestId: ctx.requestId,
        after: { expiresAt: fresh.expiresAt.toISOString() },
      });
      await this.enqueueEmail(tx, id, fresh.sendCount);
      return fresh;
    });
    return toView(row, now, reachFor(ctx, 'invitation.revoke'));
  }

  async revoke(ctx: RequestContext, id: string, reason: string): Promise<InvitationView> {
    const tenantId = tenantOf(ctx);
    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      const reach = await liveReach(tx, ctx, tenantId, 'invitation.revoke');
      const inv = await this.manageable(tx, tenantId, reach, id);
      await this.close(tx, ctx, tenantId, id, inv.branchId, reason);
      return tx.invitation.findUniqueOrThrow({ where: { id }, select: VIEW_SELECT });
    });
    return toView(row, now, reachFor(ctx, 'invitation.revoke'));
  }

  // ── The invited person (public / signed-in routes) ─────────────────────────────────────────────────────────────

  async preview(
    input: z.output<typeof InvitationPreviewBody>,
    clientIp: string,
  ): Promise<InvitationPreview> {
    await this.linkLimits(input.token, clientIp);
    const inv = await this.live(input.token);
    const account = await this.prisma.user.findUnique({
      where: { email: inv.email },
      select: { id: true },
    });
    return {
      organisation: inv.tenant.displayName,
      role: inv.role as TenantRole,
      branch: inv.branch?.name ?? null,
      email: inv.email,
      accountExists: account !== null,
      expiresAt: inv.expiresAt.toISOString(),
    };
  }

  /** A new person: creates the account (verified: the link proves the address), membership and role. Then sign in. */
  async accept(
    input: z.output<typeof AcceptInvitationBody>,
    clientIp: string,
    requestId: string,
  ): Promise<AcceptedInvitation> {
    await this.linkLimits(input.token, clientIp);
    const name = NewUser.shape.displayName.safeParse(input.displayName);
    if (!name.success) {
      throw ApiException.validation([
        {
          field: 'displayName',
          code: 'invalid',
          message: 'Enter your name (letters, no hidden characters)',
        },
      ]);
    }
    const problem = passwordProblem(input.password);
    if (problem) {
      throw ApiException.validation([
        { field: 'password', code: problem, message: POLICY_MESSAGES[problem] },
      ]);
    }
    const inv = await this.live(input.token);
    if (await this.prisma.user.findUnique({ where: { email: inv.email }, select: { id: true } })) {
      throw signInRequired();
    }
    let passwordHash: string;
    try {
      passwordHash = await hashGate.run(() => hashPassword(input.password));
    } catch (err) {
      if (err instanceof HashCapacityError) throw busy();
      throw err;
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const user = await tx.user.create({
          data: {
            email: inv.email,
            displayName: name.data,
            emailVerifiedAt: now,
            credential: { create: { passwordHash, changedAt: now } },
          },
          select: { id: true },
        });
        await this.audit.record(tx, {
          actorUserId: user.id,
          action: 'user.created',
          entityType: 'user',
          entityId: user.id,
          requestId,
          reason: 'Invitation accepted',
        });
        return this.join(tx, input.token, user.id, requestId);
      });
    } catch (err) {
      // An account for the address was created meanwhile: the person signs in and accepts with it.
      if (isUniqueViolation(err, 'users_email_key')) throw signInRequired();
      throw err;
    }
  }

  /** An existing account, signed in as the invited address (D-116): gains only this membership and role. */
  async acceptExisting(
    ctx: RequestContext,
    input: z.output<typeof AcceptExistingInvitationBody>,
    clientIp: string,
  ): Promise<AcceptedInvitation> {
    await this.linkLimits(input.token, clientIp);
    if (ctx.support) {
      throw new ApiException(409, 'SUPPORT_ACTIVE', 'End the support session first');
    }
    const inv = await this.live(input.token);
    const me = await this.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true },
    });
    if (!me || me.email.toLowerCase() !== inv.email.toLowerCase()) {
      throw new ApiException(
        403,
        'WRONG_ACCOUNT',
        'This invitation is for another email address. Sign out, then sign in as the invited address.',
      );
    }
    return this.prisma.$transaction((tx) => this.join(tx, input.token, ctx.userId, ctx.requestId));
  }

  private async linkLimits(token: string, clientIp: string) {
    await this.rateLimits.hit(INVITATION_LIMITS.link, ipSubject(clientIp));
    // Keyed by the token's hash (the limiter HMACs subjects again): never the token itself.
    await this.rateLimits.hit(INVITATION_LIMITS.linkToken, `token:${hashSessionToken(token)}`);
  }

  // ── Internals ──────────────────────────────────────────────────────────────────────────────────────────────────

  /** A live invitation for this token (pending, unexpired, tenant active); anything else is the same 400. */
  private async live(token: string) {
    const inv = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        tenant: { select: { displayName: true, status: true } },
        branch: { select: { name: true } },
      },
    });
    if (
      !inv ||
      inv.status !== 'pending' ||
      inv.expiresAt <= new Date() ||
      inv.tenant.status !== 'active'
    ) {
      throw invalidInvitation();
    }
    return inv;
  }

  /**
   * Joins the user to the invitation's tenant inside the caller's transaction and claims the invitation, exactly once:
   * re-reads it under the tenant lock, re-checks the tenant, the branch, the inviter's authority and D-115/D-037, then
   * creates membership (+ branch, primary) and role, and marks it accepted with a conditional update.
   */
  private async join(
    tx: Tx,
    token: string,
    userId: string,
    requestId: string,
  ): Promise<AcceptedInvitation> {
    const tokenHash = hashSessionToken(token);
    const found = await tx.invitation.findUnique({
      where: { tokenHash },
      select: { tenantId: true },
    });
    if (!found) throw invalidInvitation();
    const tenantRow = await lockTenant(tx, found.tenantId);
    const now = new Date();
    const inv = await tx.invitation.findFirst({
      where: { tokenHash, tenantId: found.tenantId, status: 'pending', expiresAt: { gt: now } },
      select: {
        id: true,
        tenantId: true,
        email: true,
        role: true,
        branchId: true,
        createdById: true,
        tenant: { select: { displayName: true } },
      },
    });
    if (!inv || tenantRow?.status !== 'active') throw invalidInvitation();
    if (inv.branchId) {
      // Branch deactivation does not take the tenant lock: hold the branch row so it cannot change under this join.
      await tx.$queryRaw`SELECT 1 FROM branches WHERE tenant_id = ${inv.tenantId}::uuid AND id = ${inv.branchId}::uuid FOR SHARE`;
      const branch = await tx.branch.findFirst({
        where: { id: inv.branchId, tenantId: inv.tenantId },
        select: { status: true },
      });
      if (branch?.status !== 'active') throw invalidInvitation();
    }
    if (!(await this.inviterStillMay(tx, inv))) throw invalidInvitation();
    // D-037 against a concurrent platform-role grant (security review 3.1): both lock the account row.
    await tx.$queryRaw`SELECT 1 FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    await this.assertCanJoin(tx, inv.tenantId, inv.email, 'join');

    const tenantId = inv.tenantId;
    // The granting is the inviter's: role and membership are audited with the inviter as actor, the reason naming
    // the acceptance; the acceptance itself is the invited person's.
    const granted = {
      actorUserId: inv.createdById,
      tenantId,
      requestId,
      reason: 'Invitation accepted',
    };
    const membership = await tx.membership.create({
      data: { tenantId, userId, createdById: inv.createdById },
      select: { id: true },
    });
    await this.audit.record(tx, {
      ...granted,
      action: 'membership.created',
      entityType: 'membership',
      entityId: membership.id,
    });
    if (inv.branchId) {
      await tx.membershipBranch.create({
        data: {
          tenantId,
          membershipId: membership.id,
          branchId: inv.branchId,
          createdById: inv.createdById,
        },
      });
      await tx.membership.update({
        where: { id: membership.id },
        data: { primaryBranchId: inv.branchId },
      });
      await this.audit.record(tx, {
        ...granted,
        branchId: inv.branchId,
        action: 'membership.branch_added',
        entityType: 'membership',
        entityId: membership.id,
      });
    }
    const role = await tx.roleAssignment.create({
      data: {
        tenantId,
        membershipId: membership.id,
        role: inv.role,
        branchId: inv.branchId,
        createdById: inv.createdById,
      },
      select: { id: true },
    });
    await this.audit.record(tx, {
      ...granted,
      branchId: inv.branchId,
      action: 'role.assigned',
      entityType: 'role_assignment',
      entityId: role.id,
      after: { role: inv.role, branchId: inv.branchId, membershipId: membership.id },
    });
    const claimed = await tx.invitation.updateMany({
      where: { id: inv.id, status: 'pending', tokenHash, expiresAt: { gt: now } },
      data: {
        status: 'accepted',
        tokenHash: null,
        acceptedAt: now,
        acceptedUserId: userId,
        acceptedMembershipId: membership.id,
      },
    });
    if (claimed.count !== 1) throw invalidInvitation();
    await this.audit.record(tx, {
      actorUserId: userId,
      tenantId,
      branchId: inv.branchId,
      action: 'invitation.accepted',
      entityType: 'invitation',
      entityId: inv.id,
      requestId,
      after: { membershipId: membership.id },
    });
    return { organisation: inv.tenant.displayName, membershipId: membership.id };
  }

  /** The inviter still holds `invitation.create` covering this role and branch (live roles, active membership). */
  private async inviterStillMay(
    tx: Tx,
    inv: { tenantId: string; createdById: string; role: DbTenantRole; branchId: string | null },
  ) {
    const actor = await tx.membership.findFirst({
      where: {
        tenantId: inv.tenantId,
        userId: inv.createdById,
        status: 'active',
        user: { status: 'active' },
      },
      select: {
        roleAssignments: {
          where: { revokedAt: null, OR: [{ branchId: null }, { branch: { status: 'active' } }] },
          select: { role: true, branchId: true },
        },
      },
    });
    if (!actor) return false;
    const grant = tenantGrants(
      actor.roleAssignments.map((a) => ({ role: a.role as TenantRole, branchId: a.branchId })),
    ).get('invitation.create');
    if (grant?.kind === 'all') return true;
    return (
      grant?.kind === 'branches' &&
      inv.branchId !== null &&
      grant.branchIds.has(inv.branchId) &&
      BRANCH_ADMIN_ASSIGNABLE.includes(inv.role as TenantRole)
    );
  }

  /**
   * D-115: an address with a membership here (any status) is refused, as `ALREADY_MEMBER`. D-037 / D-118: a
   * platform-staff or closed account can never join; when inviting, that is not revealed (the invitation is created
   * like any other, its email is never sent — `cannotJoin` in the job), and joining answers as for any invalid link.
   */
  private async assertCanJoin(tx: Tx, tenantId: string, email: string, step: 'invite' | 'join') {
    const user = await tx.user.findUnique({
      where: { email },
      select: {
        id: true,
        status: true,
        memberships: { where: { tenantId }, select: { id: true } },
      },
    });
    if (!user) return;
    if (user.memberships.length > 0) {
      throw new ApiException(
        409,
        'ALREADY_MEMBER',
        'This person is already a member of this organisation. Change their roles on their profile, or reactivate them.',
      );
    }
    if (step === 'join' && (await cannotJoin(tx, email))) throw invalidInvitation();
  }

  /** An open (pending or expired) invitation this reach may resend or cancel; out of reach → 404, role → 403. */
  private async manageable(tx: Tx, tenantId: string, reach: Reach, id: string) {
    const inv = await tx.invitation.findFirst({
      where: {
        id,
        tenantId,
        ...(reach.kind === 'branches' ? { branchId: { in: [...reach.branchIds] } } : {}),
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        branchId: true,
        createdById: true,
        branch: { select: { id: true } },
      },
    });
    if (!inv) throw ApiException.notFound();
    if (!manages(reach, inv))
      throw forbidden('A Branch Admin manages only Learner and Instructor invitations');
    if (inv.status !== 'pending') throw notPending();
    return inv;
  }

  private async close(
    tx: Tx,
    ctx: RequestContext,
    tenantId: string,
    id: string,
    branchId: string | null,
    reason: string,
  ) {
    const now = new Date();
    const closed = await tx.invitation.updateMany({
      where: { id, tenantId, status: 'pending' },
      data: {
        status: 'revoked',
        tokenHash: null,
        revokedAt: now,
        revokedById: ctx.userId,
        revokedReason: reason,
      },
    });
    if (closed.count !== 1) throw notPending();
    await this.audit.record(tx, {
      actorUserId: ctx.userId,
      tenantId,
      branchId,
      action: 'invitation.revoked',
      entityType: 'invitation',
      entityId: id,
      requestId: ctx.requestId,
      reason,
    });
  }

  private async expiryDays(tx: Tx, tenantId: string) {
    const settings = await tx.tenantSetting.findUnique({
      where: { tenantId },
      select: { invitationExpiryDays: true },
    });
    return settings?.invitationExpiryDays ?? DEFAULT_INVITATION_EXPIRY_DAYS;
  }

  private async enqueueEmail(tx: Tx, invitationId: string, send: number) {
    const requestId = randomUUID();
    await this.jobs.enqueue(
      {
        type: INVITATION_JOB,
        businessKey: `invitation:${invitationId}:${send}`,
        payload: { invitationId, send, requestId },
      },
      tx,
    );
  }
}

/** D-037 / D-118: a platform-staff or closed (non-active) account never joins a tenant through an invitation. */
async function cannotJoin(tx: Tx, email: string) {
  const user = await tx.user.findUnique({ where: { email }, select: { id: true, status: true } });
  return user !== null && (user.status !== 'active' || (await isPlatformStaff(tx, user.id)));
}

const notPending = () =>
  new ApiException(409, 'INVALID_STATE', 'This invitation has already been accepted or cancelled');

const signInRequired = () =>
  new ApiException(
    409,
    'SIGN_IN_REQUIRED',
    'An account already exists for this address. Sign in as it, then open the invitation link again.',
  );

const POLICY_MESSAGES = {
  too_short: 'Use at least 12 characters',
  too_long: 'Use at most 128 characters',
  too_common: 'This password is too common. Choose one that is harder to guess',
} as const;

const ROLE_LABELS: Record<TenantRole, string> = {
  tenant_admin: 'Tenant Admin',
  branch_admin: 'Branch Admin',
  learning_manager: 'Learning Manager',
  instructor: 'Instructor',
  learner: 'Learner',
  compliance_viewer: 'Compliance Viewer',
};

/** The email: no personal data in the subject (D-081 rules); the token only in the link's fragment. */
export function composeInvitation(
  webOrigin: string,
  input: {
    to: string;
    organisation: string;
    role: TenantRole;
    branch: string | null;
    expiresAt: Date;
    token: string;
  },
) {
  const link = `${webOrigin}/accept-invite#token=${input.token}`;
  const where = input.branch ? ` at ${input.branch}` : '';
  return {
    to: input.to,
    subject: 'You are invited to join an organisation on VacheLearn',
    text: [
      `You are invited to join ${input.organisation} on VacheLearn as ${ROLE_LABELS[input.role]}${where}.`,
      '',
      'Open this link to accept:',
      link,
      '',
      `The link works once and expires on ${input.expiresAt.toUTCString()}. If you did not expect this, ignore this email.`,
    ].join('\n'),
  };
}
