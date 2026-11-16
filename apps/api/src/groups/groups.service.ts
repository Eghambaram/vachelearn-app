import { Inject, Injectable } from '@nestjs/common';
import type {
  AddGroupMembersBody,
  AddGroupMembersResult,
  CreateGroupBody,
  GroupListPage,
  GroupListQuery,
  GroupMemberListPage,
  GroupMemberListQuery,
  GroupMemberView,
  GroupView,
  UpdateGroupBody,
} from '@vachelearn/contracts';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';
import { liveReach, reachFor, reachFromContext, withinReach, type Reach } from '../access/reach';
import type { RequestContext } from '../access/request-context';
import { lockTenant } from '../access/tenant-admins';
import { AuditService, changedFields, type Tx } from '../audit/audit.service';
import { ApiException } from '../common/errors/api-exception';
import { CURSORS, Cursors, afterCursor, queryKey } from '../common/pagination/keyset';
import { isUniqueViolation } from '../prisma/errors';
import { PrismaService } from '../prisma/prisma.service';
import { conflict } from '../tenancy/tenants.service';

type CreateInput = z.output<typeof CreateGroupBody>;
type UpdateInput = z.output<typeof UpdateGroupBody>;
type ListInput = z.output<typeof GroupListQuery>;
type MemberListInput = z.output<typeof GroupMemberListQuery>;
type AddInput = z.output<typeof AddGroupMembersBody>;

/** D-120: the reason recorded when leaving a branch ends the member's spells in that branch's groups. */
export const LEFT_BRANCH_REASON = 'Left the branch';

const CURRENT = { removedAt: null } as const;

/** What D-101 needs to know about a member: their branches and live roles (D-125). */
const MEMBER_REACH_SELECT = {
  branches: { select: { branch: { select: { id: true } } } },
  roleAssignments: {
    where: { revokedAt: null },
    select: { role: true, branch: { select: { id: true } } },
  },
} satisfies Prisma.MembershipSelect;

/** D-125 (D-101 applied to groups): a branch-scoped manager adds or removes only members it could manage. */
const outsideScope = () =>
  new ApiException(
    403,
    'OUTSIDE_BRANCH_SCOPE',
    'This person also belongs to branches you do not manage, or holds a role you cannot grant. Ask a Tenant Admin.',
  );

const GROUP_SELECT = {
  id: true,
  tenantId: true,
  name: true,
  description: true,
  branchId: true,
  status: true,
  archivedAt: true,
  archivedReason: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  branch: { select: { id: true, code: true, name: true } },
  _count: { select: { members: { where: CURRENT } } },
} satisfies Prisma.GroupSelect;
type GroupRow = Prisma.GroupGetPayload<{ select: typeof GROUP_SELECT }>;

/**
 * Groups a reach covers (D-121): the whole tenant, or only branch groups on the caller's branches — a branch-scoped
 * caller never sees a whole-organisation group (its branch id is null, so it is not `in` any set).
 */
export function groupsInReach(reach: Reach): Prisma.GroupWhereInput {
  return reach.kind === 'tenant' ? {} : { branchId: { in: [...reach.branchIds] } };
}

/** Whether a reach covers a group with this branch (null = whole organisation: tenant-wide reach only). */
export function reachCovers(reach: Reach | null, branchId: string | null) {
  if (!reach) return false;
  return reach.kind === 'tenant' || (branchId !== null && reach.branchIds.has(branchId));
}

function tenantOf(ctx: RequestContext) {
  if (!ctx.tenant) throw ApiException.notFound();
  return ctx.tenant.tenantId;
}

function nameTaken() {
  return ApiException.validation([
    { field: 'name', code: 'taken', message: 'An active group in this organisation has this name' },
  ]);
}

/**
 * Groups of the caller's tenant (spec §5, D-119–D-122). The tenant comes from the request context only; every query
 * is filtered by tenant and by the caller's reach in the query itself, so a group, member or spell out of reach is a
 * 404. Groups are archived, never deleted; a member's removal is recorded on the spell and kept (the database refuses
 * deletes and rewrites, and refuses a branch group member who is not in that branch).
 */
@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(CURSORS) private readonly cursors: Cursors,
  ) {}

  private view(ctx: RequestContext, g: GroupRow): GroupView {
    return {
      id: g.id,
      name: g.name,
      description: g.description,
      branch: g.branch,
      status: g.status,
      memberCount: g._count.members,
      archivedAt: g.archivedAt?.toISOString() ?? null,
      archivedReason: g.archivedReason,
      version: g.version,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
      // Support sessions are read-only (D-037).
      canManage: !ctx.support && reachCovers(reachFor(ctx, 'group.manage'), g.branchId),
    };
  }

  async list(ctx: RequestContext, input: ListInput): Promise<GroupListPage> {
    const tenantId = tenantOf(ctx);
    const reach = reachFromContext(ctx);
    const { cursor, ...query } = input;
    // The scope is part of the key: a cursor never carries over to another tenant or scope.
    const key = queryKey([
      'groups',
      tenantId,
      reach.kind === 'tenant' ? 'ALL' : [...reach.branchIds].sort(),
      query.status ?? '',
      query.branchId ?? '',
      query.scope ?? '',
      query.search ?? '',
      query.sort,
      query.direction,
      query.limit,
    ]);
    const position = cursor
      ? this.cursors.decode(cursor, key, query.sort === 'createdAt' ? 'instant' : 'string')
      : null;
    const rows = await this.prisma.group.findMany({
      where: {
        AND: [
          { tenantId },
          // The client's filters are intersected with the reach, never replace it.
          groupsInReach(reach),
          query.branchId ? { branchId: query.branchId } : {},
          query.scope === 'tenant'
            ? { branchId: null }
            : query.scope === 'branch'
              ? { branchId: { not: null } }
              : {},
          query.status ? { status: query.status } : {},
          query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {},
          position ? afterCursor(query.sort, query.direction, position.value, position.id) : {},
        ],
      },
      orderBy: [{ [query.sort]: query.direction }, { id: query.direction }],
      take: query.limit + 1,
      select: GROUP_SELECT,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      data: page.map((g) => this.view(ctx, g)),
      page: {
        limit: query.limit,
        nextCursor:
          rows.length > query.limit && last
            ? this.cursors.encode(
                query.sort === 'createdAt' ? last.createdAt.toISOString() : last.name,
                last.id,
                key,
              )
            : null,
      },
    };
  }

  async get(ctx: RequestContext, id: string): Promise<GroupView> {
    const tenantId = tenantOf(ctx);
    const group = await this.prisma.group.findFirst({
      where: { id, tenantId, ...groupsInReach(reachFromContext(ctx)) },
      select: GROUP_SELECT,
    });
    if (!group) throw ApiException.notFound();
    return this.view(ctx, group);
  }

  async create(ctx: RequestContext, input: CreateInput): Promise<GroupView> {
    const tenantId = tenantOf(ctx);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockTenant(tx, tenantId);
        const reach = await liveReach(tx, ctx, tenantId, 'group.manage');
        if (input.branchId === null) {
          // A whole-organisation group is a tenant-wide act (D-121).
          if (reach.kind !== 'tenant') throw new ApiException(403, 'FORBIDDEN', 'Forbidden');
        } else {
          if (!reachCovers(reach, input.branchId)) throw ApiException.notFound();
          const branch = await tx.branch.findFirst({
            where: { id: input.branchId, tenantId },
            select: { status: true },
          });
          if (!branch) throw ApiException.notFound();
          if (branch.status !== 'active') {
            throw ApiException.validation([
              { field: 'branchId', code: 'inactive', message: 'The branch is inactive' },
            ]);
          }
        }
        const created = await tx.group.create({
          data: {
            tenantId,
            name: input.name,
            description: input.description ?? null,
            branchId: input.branchId,
            createdById: ctx.userId,
          },
          select: GROUP_SELECT,
        });
        await this.audit.record(tx, {
          actorUserId: ctx.userId,
          tenantId,
          branchId: created.branchId,
          action: 'group.created',
          entityType: 'group',
          entityId: created.id,
          requestId: ctx.requestId,
          after: { name: created.name, branchId: created.branchId, status: created.status },
        });
        return this.view(ctx, created);
      });
    } catch (err) {
      if (isUniqueViolation(err, 'groups_active_name_unique')) throw nameTaken();
      throw err;
    }
  }

  /** The group as the caller may manage it now (live reach, after the tenant lock); out of reach → 404. */
  private async manageable(
    tx: Tx,
    ctx: RequestContext,
    tenantId: string,
    id: string,
    permission: 'group.manage' | 'group.member.manage',
  ) {
    const reach = await liveReach(tx, ctx, tenantId, permission);
    const group = await tx.group.findFirst({
      where: { id, tenantId, ...groupsInReach(reach) },
      select: {
        id: true,
        branchId: true,
        status: true,
        version: true,
        name: true,
        description: true,
        branch: { select: { status: true } },
      },
    });
    if (!group) throw ApiException.notFound();
    return { group, reach };
  }

  async update(ctx: RequestContext, id: string, input: UpdateInput): Promise<GroupView> {
    const tenantId = tenantOf(ctx);
    const { version, ...patch } = input;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockTenant(tx, tenantId);
        const { group } = await this.manageable(tx, ctx, tenantId, id, 'group.manage');
        if (group.version !== version) throw conflict();
        // The description is free text: recorded as changed, never by value.
        const diff = changedFields(group, patch, { personal: ['description'] });
        const result = await tx.group.updateMany({
          where: { id, tenantId, version },
          data: { ...patch, version: { increment: 1 } },
        });
        if (result.count === 0) throw conflict();
        if (diff.changed) {
          await this.audit.record(tx, {
            actorUserId: ctx.userId,
            tenantId,
            branchId: group.branchId,
            action: 'group.updated',
            entityType: 'group',
            entityId: id,
            requestId: ctx.requestId,
            before: diff.before,
            after: diff.after,
          });
        }
        return this.view(
          ctx,
          await tx.group.findFirstOrThrow({ where: { id, tenantId }, select: GROUP_SELECT }),
        );
      });
    } catch (err) {
      if (isUniqueViolation(err, 'groups_active_name_unique')) throw nameTaken();
      throw err;
    }
  }

  /** Archive (takes no new members; history kept) or reactivate, with a reason (D-121). */
  async setArchived(
    ctx: RequestContext,
    id: string,
    archived: boolean,
    reason: string,
  ): Promise<GroupView> {
    const tenantId = tenantOf(ctx);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockTenant(tx, tenantId);
        const { group } = await this.manageable(tx, ctx, tenantId, id, 'group.manage');
        const from = archived ? 'active' : 'archived';
        const result = await tx.group.updateMany({
          where: { id, tenantId, status: from },
          data: archived
            ? {
                status: 'archived',
                archivedAt: new Date(),
                archivedReason: reason,
                archivedById: ctx.userId,
                version: { increment: 1 },
              }
            : {
                status: 'active',
                archivedAt: null,
                archivedReason: null,
                archivedById: null,
                version: { increment: 1 },
              },
        });
        if (result.count === 0) {
          throw new ApiException(409, 'INVALID_STATE', `The group is already ${group.status}`);
        }
        await this.audit.record(tx, {
          actorUserId: ctx.userId,
          tenantId,
          branchId: group.branchId,
          action: archived ? 'group.archived' : 'group.reactivated',
          entityType: 'group',
          entityId: id,
          requestId: ctx.requestId,
          reason,
          before: { status: group.status },
          after: { status: archived ? 'archived' : 'active' },
        });
        return this.view(
          ctx,
          await tx.group.findFirstOrThrow({ where: { id, tenantId }, select: GROUP_SELECT }),
        );
      });
    } catch (err) {
      // Reactivating while another active group took the name meanwhile.
      if (isUniqueViolation(err, 'groups_active_name_unique')) throw nameTaken();
      throw err;
    }
  }

  async listMembers(
    ctx: RequestContext,
    groupId: string,
    input: MemberListInput,
  ): Promise<GroupMemberListPage> {
    const tenantId = tenantOf(ctx);
    const reach = reachFromContext(ctx);
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, tenantId, ...groupsInReach(reach) },
      select: { id: true },
    });
    if (!group) throw ApiException.notFound();
    // The screen's Remove button (D-125); the API checks again on every removal.
    const manage = reachFor(ctx, 'group.member.manage');
    const manages =
      manage !== null &&
      (await this.prisma.group.count({
        where: { id: groupId, tenantId, status: 'active', ...groupsInReach(manage) },
      })) > 0;
    const { cursor, ...query } = input;
    const field = query.state === 'current' ? 'addedAt' : 'removedAt';
    const key = queryKey([
      'group-members',
      tenantId,
      groupId,
      reach.kind === 'tenant' ? 'ALL' : [...reach.branchIds].sort(),
      query.state,
      query.search ?? '',
      query.limit,
    ]);
    const position = cursor ? this.cursors.decode(cursor, key, 'instant') : null;
    const rows = await this.prisma.groupMember.findMany({
      where: {
        AND: [
          { tenantId, groupId },
          query.state === 'current' ? CURRENT : { removedAt: { not: null } },
          query.search
            ? {
                membership: {
                  user: {
                    OR: [
                      { displayName: { contains: query.search, mode: 'insensitive' } },
                      { email: { contains: query.search, mode: 'insensitive' } },
                    ],
                  },
                },
              }
            : {},
          position ? afterCursor(field, 'desc', position.value, position.id) : {},
        ],
      },
      orderBy: [{ [field]: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: {
        id: true,
        membershipId: true,
        addedAt: true,
        removedAt: true,
        removedReason: true,
        membership: {
          select: {
            status: true,
            user: { select: { displayName: true, email: true } },
            ...MEMBER_REACH_SELECT,
          },
        },
      },
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const data: GroupMemberView[] = page.map((m) => ({
      id: m.id,
      membershipId: m.membershipId,
      displayName: m.membership.user.displayName,
      email: m.membership.user.email,
      memberStatus: m.membership.status,
      addedAt: m.addedAt.toISOString(),
      removedAt: m.removedAt?.toISOString() ?? null,
      removedReason: m.removedReason,
      canRemove:
        manages && m.removedAt === null && manage !== null && withinReach(manage, m.membership),
    }));
    const lastValue = last ? (field === 'addedAt' ? last.addedAt : last.removedAt) : null;
    return {
      data,
      page: {
        limit: query.limit,
        nextCursor:
          rows.length > query.limit && last && lastValue
            ? this.cursors.encode(lastValue.toISOString(), last.id, key)
            : null,
      },
    };
  }

  /**
   * Adds active members (D-120): any member of the tenant to a whole-organisation group, only members of the group's
   * branch to a branch group. One id the caller may not add → 404 for the whole request and nothing is added (which ids
   * exist is never revealed). Already current members are left as they are, so a retry is a no-op.
   */
  async addMembers(
    ctx: RequestContext,
    groupId: string,
    input: AddInput,
  ): Promise<AddGroupMembersResult> {
    const tenantId = tenantOf(ctx);
    const ids = [...new Set(input.membershipIds)];
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      const { group, reach } = await this.manageable(
        tx,
        ctx,
        tenantId,
        groupId,
        'group.member.manage',
      );
      if (group.status !== 'active') {
        throw new ApiException(409, 'GROUP_ARCHIVED', 'An archived group takes no new members');
      }
      // As for creating one (isolation audit 3.2): no new members on an inactive branch's group.
      if (group.branch && group.branch.status !== 'active') {
        throw new ApiException(409, 'BRANCH_INACTIVE', 'The group’s branch is inactive');
      }
      const members = await tx.membership.findMany({
        where: {
          tenantId,
          id: { in: ids },
          ...(group.branchId ? { branches: { some: { branchId: group.branchId } } } : {}),
        },
        select: { id: true, status: true, ...MEMBER_REACH_SELECT },
      });
      if (members.length !== ids.length) throw ApiException.notFound();
      if (!members.every((m) => withinReach(reach, m))) throw outsideScope();
      if (members.some((m) => m.status !== 'active')) {
        throw ApiException.validation([
          {
            field: 'membershipIds',
            code: 'deactivated',
            message: 'Deactivated members cannot be added',
          },
        ]);
      }
      const current = await tx.groupMember.findMany({
        where: { tenantId, groupId, membershipId: { in: ids }, ...CURRENT },
        select: { membershipId: true },
      });
      const already = new Set(current.map((c) => c.membershipId));
      const toAdd = ids.filter((id) => !already.has(id));
      if (toAdd.length > 0) {
        await tx.groupMember.createMany({
          data: toAdd.map((membershipId) => ({
            tenantId,
            groupId,
            membershipId,
            addedById: ctx.userId,
          })),
        });
        for (const membershipId of toAdd) {
          await this.audit.record(tx, {
            actorUserId: ctx.userId,
            tenantId,
            branchId: group.branchId,
            action: 'group.member_added',
            entityType: 'group',
            entityId: groupId,
            requestId: ctx.requestId,
            after: { membershipId },
          });
        }
      }
      return { added: toAdd.length, alreadyMembers: already.size };
    });
  }

  /** Ends one current spell, keeping it with when, who and why (D-120). */
  async removeMember(
    ctx: RequestContext,
    groupId: string,
    memberId: string,
    reason: string,
  ): Promise<GroupMemberView> {
    const tenantId = tenantOf(ctx);
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      const { group, reach } = await this.manageable(
        tx,
        ctx,
        tenantId,
        groupId,
        'group.member.manage',
      );
      const spell = await tx.groupMember.findFirst({
        where: { id: memberId, tenantId, groupId },
        select: {
          id: true,
          membershipId: true,
          removedAt: true,
          membership: { select: MEMBER_REACH_SELECT },
        },
      });
      if (!spell) throw ApiException.notFound();
      if (!withinReach(reach, spell.membership)) throw outsideScope();
      const result = await tx.groupMember.updateMany({
        where: { id: memberId, tenantId, groupId, ...CURRENT },
        data: { removedAt: new Date(), removedById: ctx.userId, removedReason: reason },
      });
      if (result.count === 0) {
        throw new ApiException(409, 'INVALID_STATE', 'The member was already removed');
      }
      await this.audit.record(tx, {
        actorUserId: ctx.userId,
        tenantId,
        branchId: group.branchId,
        action: 'group.member_removed',
        entityType: 'group',
        entityId: groupId,
        requestId: ctx.requestId,
        reason,
        after: { membershipId: spell.membershipId },
      });
      const row = await tx.groupMember.findFirstOrThrow({
        where: { id: memberId, tenantId },
        select: {
          id: true,
          membershipId: true,
          addedAt: true,
          removedAt: true,
          removedReason: true,
          membership: {
            select: { status: true, user: { select: { displayName: true, email: true } } },
          },
        },
      });
      return {
        id: row.id,
        membershipId: row.membershipId,
        displayName: row.membership.user.displayName,
        email: row.membership.user.email,
        memberStatus: row.membership.status,
        addedAt: row.addedAt.toISOString(),
        removedAt: row.removedAt?.toISOString() ?? null,
        removedReason: row.removedReason,
        canRemove: false,
      };
    });
  }
}

/**
 * D-120, called inside the caller's transaction (after the tenant lock) before a member's branch is removed: ends the
 * member's current spells in that branch's groups with the reason "Left the branch", each audited.
 */
export async function endBranchGroupSpells(
  tx: Tx,
  audit: AuditService,
  ctx: RequestContext,
  tenantId: string,
  membershipId: string,
  branchId: string,
) {
  const spells = await tx.groupMember.findMany({
    where: { tenantId, membershipId, ...CURRENT, group: { branchId } },
    select: { id: true, groupId: true },
  });
  if (spells.length === 0) return;
  await tx.groupMember.updateMany({
    where: { tenantId, id: { in: spells.map((s) => s.id) }, ...CURRENT },
    data: { removedAt: new Date(), removedById: ctx.userId, removedReason: LEFT_BRANCH_REASON },
  });
  for (const spell of spells) {
    await audit.record(tx, {
      actorUserId: ctx.userId,
      tenantId,
      branchId,
      action: 'group.member_removed',
      entityType: 'group',
      entityId: spell.groupId,
      requestId: ctx.requestId,
      reason: LEFT_BRANCH_REASON,
      after: { membershipId },
    });
  }
}
