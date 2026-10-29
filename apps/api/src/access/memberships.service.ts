import { Injectable } from '@nestjs/common';
import type { MembershipSummary } from '@vachelearn/contracts';
import type { TenantRole as DbTenantRole } from '../../generated/prisma/client';
import { AuditService, type Tx } from '../audit/audit.service';
import { ApiException } from '../common/errors/api-exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  BRANCH_ONLY_ROLES,
  TENANT_ONLY_ROLES,
  platformGrants,
  tenantGrants,
  type PlatformRole,
  type TenantPermission,
  type TenantRole,
} from './permissions';
import type { RequestContext } from './request-context';

/*
 * Memberships and role assignments (Slice 2.4a; D-026, D-053, D-089). The tenant a session works in is the session's
 * active membership — never a header, URL, slug or body. What it may do comes from the membership's live role
 * assignments; platform staff grants come only from platform roles and never reach tenant data (D-037).
 */

type ActiveTenantView = {
  membershipId: string;
  tenantId: string;
  slug: string;
  displayName: string;
};

export type SessionAccess = {
  platform: RequestContext['platform'];
  tenant: RequestContext['tenant'];
  tenantBlocked?: 'suspended' | 'archived';
  activeTenant: ActiveTenantView | null;
};

const LIVE = { revokedAt: null } as const;

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The membership a new session starts in: the only one, when there is exactly one usable membership. */
  async defaultMembership(userId: string): Promise<string | null> {
    const usable = await this.prisma.membership.findMany({
      where: { userId, status: 'active', tenant: { status: 'active' } },
      select: { id: true },
      take: 2,
    });
    return usable.length === 1 ? usable[0]!.id : null;
  }

  /** Grants for a session: platform roles, plus the active membership's tenant grants (if any). */
  async accessFor(userId: string, activeMembershipId: string | null): Promise<SessionAccess> {
    const platformRoles = await this.prisma.platformRoleAssignment.findMany({
      where: { userId, ...LIVE },
      select: { role: true },
    });
    const platform = platformRoles.length
      ? { permissions: platformGrants(platformRoles.map((r) => r.role as PlatformRole)) }
      : null;
    if (!activeMembershipId) return { platform, tenant: null, activeTenant: null };

    const membership = await this.prisma.membership.findFirst({
      // The user id is part of the lookup: a session can only ever use its own user's membership.
      where: { id: activeMembershipId, userId, status: 'active' },
      select: {
        id: true,
        tenant: { select: { id: true, slug: true, displayName: true, status: true } },
        // A role on a deactivated branch grants nothing (D-090, Proposed): fail closed.
        roleAssignments: {
          where: { ...LIVE, OR: [{ branchId: null }, { branch: { status: 'active' } }] },
          select: { role: true, branchId: true },
        },
      },
    });
    if (!membership) return { platform, tenant: null, activeTenant: null };
    const activeTenant = {
      membershipId: membership.id,
      tenantId: membership.tenant.id,
      slug: membership.tenant.slug,
      displayName: membership.tenant.displayName,
    };
    if (membership.tenant.status !== 'active') {
      return { platform, tenant: null, tenantBlocked: membership.tenant.status, activeTenant };
    }
    const grants = tenantGrants(
      membership.roleAssignments.map((a) => ({ role: a.role as TenantRole, branchId: a.branchId })),
    );
    return {
      platform,
      tenant: {
        tenantId: membership.tenant.id,
        membershipId: membership.id,
        permissions: new Set(grants.keys()) as ReadonlySet<TenantPermission>,
        grants,
        branchScope: [],
      },
      activeTenant,
    };
  }

  /** The caller's memberships (active, in tenants that are not archived), with roles and which one is active. */
  async listOwn(userId: string, activeMembershipId: string | null): Promise<MembershipSummary[]> {
    const rows = await this.prisma.membership.findMany({
      where: { userId, status: 'active', tenant: { status: { in: ['active', 'suspended'] } } },
      orderBy: { tenant: { displayName: 'asc' } },
      select: {
        id: true,
        tenant: { select: { id: true, slug: true, displayName: true, status: true } },
        roleAssignments: {
          where: LIVE,
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
          select: { role: true, branch: { select: { id: true, code: true, name: true } } },
        },
      },
    });
    return rows.map((m) => ({
      membershipId: m.id,
      tenant: {
        id: m.tenant.id,
        slug: m.tenant.slug,
        displayName: m.tenant.displayName,
        status: m.tenant.status as 'active' | 'suspended',
      },
      roles: m.roleAssignments.map((a) => ({ role: a.role, branch: a.branch })),
      active: m.id === activeMembershipId,
    }));
  }

  /**
   * Makes one of the caller's own memberships the session's active tenant (D-089). Someone else's membership, an
   * inactive one or a missing one is the same 404; a suspended or archived tenant is a 403.
   */
  async switchTenant(ctx: RequestContext, membershipId: string) {
    if (!ctx.session) throw new ApiException(401, 'UNAUTHENTICATED', 'Not signed in');
    // Inside a support session the tenant is the support tenant; switching would mislabel what is shown.
    if (ctx.support) {
      throw new ApiException(
        409,
        'SUPPORT_ACTIVE',
        'End the support session before switching organisation',
      );
    }
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, userId: ctx.userId, status: 'active' },
      select: { id: true, tenantId: true, tenant: { select: { status: true } } },
    });
    if (!membership) throw ApiException.notFound();
    if (membership.tenant.status !== 'active') {
      throw membership.tenant.status === 'suspended'
        ? new ApiException(403, 'TENANT_SUSPENDED', 'This organisation is suspended')
        : new ApiException(403, 'TENANT_ARCHIVED', 'This organisation is archived');
    }
    const sessionId = ctx.session.id;
    const previous = ctx.session.activeMembershipId;
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.authSession.updateMany({
        where: { id: sessionId, userId: ctx.userId, endedAt: null },
        data: { activeMembershipId: membership.id },
      });
      // The session ended meanwhile (signed out in another tab): nothing switched, nothing to audit.
      if (count !== 1) throw new ApiException(401, 'UNAUTHENTICATED', 'Not signed in');
      await this.audit.record(tx, {
        actorUserId: ctx.userId,
        tenantId: membership.tenantId,
        action: 'auth.tenant_switched',
        entityType: 'membership',
        entityId: membership.id,
        requestId: ctx.requestId,
        before: { membershipId: previous },
        after: { membershipId: membership.id },
      });
    });
  }

  /** Records that a session started working in the user's only membership (sign-in or first request after it). */
  async recordAutoSelection(
    tx: Tx,
    userId: string,
    membershipId: string,
    requestId: string | null,
  ) {
    const membership = await tx.membership.findFirstOrThrow({
      where: { id: membershipId, userId },
      select: { tenantId: true },
    });
    await this.audit.record(tx, {
      actorUserId: userId,
      tenantId: membership.tenantId,
      action: 'auth.tenant_selected',
      entityType: 'membership',
      entityId: membershipId,
      requestId,
    });
  }

  // ── Operator path (CLI; the role-assignment API with the granting rules is Slice 2.4b) ───────────────────────────

  /**
   * OPERATOR ONLY (CLI): adds a tenant role, and the membership and branch membership it needs; idempotent for a live
   * assignment. It applies no granting rules — the role-assignment API (2.4b) has its own actor-checked path and must
   * not call this. The account must be active, the tenant not archived, the branch active and in that tenant.
   */
  async operatorGrantTenantRole(
    input: { userId: string; tenantId: string; role: TenantRole; branchId: string | null },
    actor: { userId: string | null; requestId: string | null; reason: string },
  ) {
    if (BRANCH_ONLY_ROLES.includes(input.role) && !input.branchId) {
      throw ApiException.validation([
        { field: 'branch', code: 'required', message: 'A Branch Admin needs a branch' },
      ]);
    }
    if (TENANT_ONLY_ROLES.includes(input.role) && input.branchId) {
      throw ApiException.validation([
        {
          field: 'branch',
          code: 'not_allowed',
          message: 'A Tenant Admin is for the whole tenant, not a branch',
        },
      ]);
    }
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { status: true },
      });
      if (user?.status !== 'active')
        throw new ApiException(409, 'INVALID_STATE', 'The account is not active');
      const tenant = await tx.tenant.findUnique({
        where: { id: input.tenantId },
        select: { status: true },
      });
      if (!tenant) throw ApiException.notFound();
      if (tenant.status === 'archived')
        throw new ApiException(409, 'INVALID_STATE', 'The tenant is archived');
      if (input.branchId) {
        const branch = await tx.branch.findFirst({
          where: { id: input.branchId, tenantId: input.tenantId, status: 'active' },
          select: { id: true },
        });
        if (!branch) throw ApiException.notFound();
      }
      const membership = await this.ensureMembership(tx, input.userId, input.tenantId, actor);
      if (input.branchId) {
        const existing = await tx.membershipBranch.findUnique({
          where: {
            membershipId_branchId: { membershipId: membership.id, branchId: input.branchId },
          },
          select: { branchId: true },
        });
        if (!existing) {
          await tx.membershipBranch.create({
            data: {
              tenantId: input.tenantId,
              membershipId: membership.id,
              branchId: input.branchId,
              createdById: actor.userId,
            },
          });
          await this.audit.record(tx, {
            actorUserId: actor.userId,
            tenantId: input.tenantId,
            branchId: input.branchId,
            action: 'membership.branch_added',
            entityType: 'membership',
            entityId: membership.id,
            requestId: actor.requestId,
            reason: actor.reason,
          });
        }
        const primary = await tx.membership.updateMany({
          where: { id: membership.id, primaryBranchId: null },
          data: { primaryBranchId: input.branchId },
        });
        if (primary.count === 1) {
          await this.audit.record(tx, {
            actorUserId: actor.userId,
            tenantId: input.tenantId,
            branchId: input.branchId,
            action: 'membership.primary_branch_set',
            entityType: 'membership',
            entityId: membership.id,
            requestId: actor.requestId,
            reason: actor.reason,
          });
        }
      }
      const live = await tx.roleAssignment.findFirst({
        where: { membershipId: membership.id, role: input.role, branchId: input.branchId, ...LIVE },
        select: { id: true },
      });
      if (live) return { membershipId: membership.id, assignmentId: live.id, created: false };
      const assignment = await tx.roleAssignment.create({
        data: {
          tenantId: input.tenantId,
          membershipId: membership.id,
          role: input.role as DbTenantRole,
          branchId: input.branchId,
          createdById: actor.userId,
        },
        select: { id: true },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        tenantId: input.tenantId,
        branchId: input.branchId,
        action: 'role.assigned',
        entityType: 'role_assignment',
        entityId: assignment.id,
        requestId: actor.requestId,
        reason: actor.reason,
        after: { role: input.role, branchId: input.branchId, membershipId: membership.id },
      });
      return { membershipId: membership.id, assignmentId: assignment.id, created: true };
    });
  }

  /** OPERATOR ONLY (CLI): grants a platform role to an active account; idempotent for a live assignment. */
  async operatorGrantPlatformRole(
    input: { userId: string; role: PlatformRole },
    actor: { userId: string | null; requestId: string | null; reason: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { status: true },
      });
      if (user?.status !== 'active')
        throw new ApiException(409, 'INVALID_STATE', 'The account is not active');
      const live = await tx.platformRoleAssignment.findFirst({
        where: { userId: input.userId, role: input.role, ...LIVE },
        select: { id: true },
      });
      if (live) return { assignmentId: live.id, created: false };
      const assignment = await tx.platformRoleAssignment.create({
        data: { userId: input.userId, role: input.role, createdById: actor.userId },
        select: { id: true },
      });
      await this.audit.record(tx, {
        actorUserId: actor.userId,
        action: 'platform_role.assigned',
        entityType: 'platform_role_assignment',
        entityId: assignment.id,
        requestId: actor.requestId,
        reason: actor.reason,
        after: { role: input.role, userId: input.userId },
      });
      return { assignmentId: assignment.id, created: true };
    });
  }

  private async ensureMembership(
    tx: Tx,
    userId: string,
    tenantId: string,
    actor: { userId: string | null; requestId: string | null; reason: string },
  ) {
    const existing = await tx.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status !== 'active') {
        throw new ApiException(409, 'INVALID_STATE', 'The membership is deactivated');
      }
      return existing;
    }
    const created = await tx.membership.create({
      data: { tenantId, userId, createdById: actor.userId },
      select: { id: true, status: true },
    });
    await this.audit.record(tx, {
      actorUserId: actor.userId,
      tenantId,
      action: 'membership.created',
      entityType: 'membership',
      entityId: created.id,
      requestId: actor.requestId,
      reason: actor.reason,
    });
    return created;
  }
}
