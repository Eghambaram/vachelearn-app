import { z } from 'zod';
import { Cursor, IsoInstant, ListLimit, cursorPage } from './common';
import { MemberStatus } from './people';
import { LifecycleBody } from './tenancy';

/*
 * Groups (Slice 3.2; spec §5; D-119–D-122; matrix `group.*`). A group covers the whole tenant or one branch (D-119),
 * fixed at creation. Members are added by hand; a branch group holds only members of that branch (D-120). Removing
 * someone records when, who and why — the spell stays in the history and re-adding starts a new one. Groups are
 * archived with a reason and can be reactivated, never deleted; names are unique among active groups (D-121). A
 * Branch Admin sees and manages only its branches' groups, never tenant groups.
 */

const Version = z.number().int().min(1);

export const GroupStatus = z.enum(['active', 'archived']);
export type GroupStatus = z.infer<typeof GroupStatus>;

export const GroupName = z.string().trim().min(2).max(80);
export const GroupDescription = z.string().trim().min(1).max(500);

const BranchRef = z.object({ id: z.uuid(), code: z.string(), name: z.string() });

export const GroupView = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  /** Null = the whole organisation. */
  branch: BranchRef.nullable(),
  status: GroupStatus,
  /** Current members (removed spells are history, not counted). */
  memberCount: z.number().int().min(0),
  archivedAt: IsoInstant.nullable(),
  archivedReason: z.string().nullable(),
  version: Version,
  createdAt: IsoInstant,
  updatedAt: IsoInstant,
  /** Whether this caller may edit, archive and change members (read-only readers: false). */
  canManage: z.boolean(),
});
export type GroupView = z.infer<typeof GroupView>;

export const CreateGroupBody = z.strictObject({
  name: GroupName,
  description: GroupDescription.nullable().optional(),
  /** Null = the whole organisation (Tenant Admin or tenant-wide Learning Manager only). Fixed once created. */
  branchId: z.uuid().nullable(),
});
export type CreateGroupBody = z.input<typeof CreateGroupBody>;

/** Name and description only: the scope never changes (its members were chosen for it). */
export const UpdateGroupBody = z
  .strictObject({
    version: Version,
    name: GroupName.optional(),
    description: GroupDescription.nullable().optional(),
  })
  .refine((b) => Object.keys(b).some((k) => k !== 'version'), 'nothing to change');
export type UpdateGroupBody = z.input<typeof UpdateGroupBody>;

/** Archive or reactivate: the reason is recorded. */
export const GroupLifecycleBody = LifecycleBody;

export const GroupListQuery = z.strictObject({
  status: GroupStatus.optional(),
  /** Narrows the caller's scope; never widens it. */
  branchId: z.uuid().optional(),
  /** `tenant` = whole-organisation groups only. */
  scope: z.enum(['tenant', 'branch']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['name', 'createdAt']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  cursor: Cursor.optional(),
  limit: ListLimit,
});
export type GroupListQuery = z.input<typeof GroupListQuery>;
export const GroupListPage = cursorPage(GroupView);
export type GroupListPage = z.infer<typeof GroupListPage>;

/** One spell of a member in the group. */
export const GroupMemberView = z.object({
  id: z.uuid(),
  membershipId: z.uuid(),
  displayName: z.string(),
  email: z.string(),
  /** The member's status in the organisation (a deactivated member stays listed, D-120). */
  memberStatus: MemberStatus,
  addedAt: IsoInstant,
  /** Null for a current member. */
  removedAt: IsoInstant.nullable(),
  removedReason: z.string().nullable(),
  /**
   * Whether this caller may remove this current member: they manage the group and, if branch-scoped, the member is
   * one they could manage (D-125, D-101). The API checks again on every removal.
   */
  canRemove: z.boolean(),
});
export type GroupMemberView = z.infer<typeof GroupMemberView>;

export const GroupMemberListQuery = z.strictObject({
  /** `current` (default) or `removed` (the history). */
  state: z.enum(['current', 'removed']).default('current'),
  search: z.string().trim().min(1).max(100).optional(),
  cursor: Cursor.optional(),
  limit: ListLimit,
});
export type GroupMemberListQuery = z.input<typeof GroupMemberListQuery>;
export const GroupMemberListPage = cursorPage(GroupMemberView);
export type GroupMemberListPage = z.infer<typeof GroupMemberListPage>;

/** `POST /groups/:id/members`: members of this organisation (and of the group's branch, for a branch group). */
export const AddGroupMembersBody = z.strictObject({
  membershipIds: z.array(z.uuid()).min(1).max(100),
});
export type AddGroupMembersBody = z.input<typeof AddGroupMembersBody>;

export const AddGroupMembersResult = z.object({
  /** Newly added. */
  added: z.number().int().min(0),
  /** Already current members: left as they were (adding is idempotent). */
  alreadyMembers: z.number().int().min(0),
});
export type AddGroupMembersResult = z.infer<typeof AddGroupMembersResult>;

/** `POST /groups/:id/members/:memberId/remove`: the reason is kept with the spell. */
export const RemoveGroupMemberBody = LifecycleBody;
