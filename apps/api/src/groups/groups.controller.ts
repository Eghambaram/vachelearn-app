import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AddGroupMembersBody,
  AddGroupMembersResult,
  CreateGroupBody,
  GroupLifecycleBody,
  GroupListPage,
  GroupListQuery,
  GroupMemberListPage,
  GroupMemberListQuery,
  GroupMemberView,
  GroupView,
  RemoveGroupMemberBody,
  UpdateGroupBody,
} from '@vachelearn/contracts';
import type { z } from 'zod';
import { RequireTenantPermission } from '../access/access.guard';
import { Ctx, type RequestContext } from '../access/request-context';
import { ApiZodBody, ApiZodResponse } from '../common/openapi/zod-openapi';
import { UuidParamPipe } from '../common/validation/uuid-param.pipe';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { GroupsService } from './groups.service';

type Lifecycle = z.output<typeof GroupLifecycleBody>;

/** Groups of the caller's own tenant (spec §5, D-119–D-122). No tenant id in any route, query or body. */
@ApiTags('groups')
@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  @RequireTenantPermission('group.read')
  @ApiZodResponse(200, GroupListPage)
  list(
    @Ctx() ctx: RequestContext,
    @Query(new ZodValidationPipe(GroupListQuery)) query: z.output<typeof GroupListQuery>,
  ) {
    return this.groups.list(ctx, query);
  }

  @Get(':id')
  @RequireTenantPermission('group.read')
  @ApiZodResponse(200, GroupView)
  get(@Ctx() ctx: RequestContext, @Param('id', UuidParamPipe) id: string) {
    return this.groups.get(ctx, id);
  }

  @Post()
  @RequireTenantPermission('group.manage')
  @ApiZodBody(CreateGroupBody)
  @ApiZodResponse(201, GroupView)
  create(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(CreateGroupBody)) body: z.output<typeof CreateGroupBody>,
  ) {
    return this.groups.create(ctx, body);
  }

  @Patch(':id')
  @RequireTenantPermission('group.manage')
  @ApiZodBody(UpdateGroupBody)
  @ApiZodResponse(200, GroupView)
  update(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(UpdateGroupBody)) body: z.output<typeof UpdateGroupBody>,
  ) {
    return this.groups.update(ctx, id, body);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequireTenantPermission('group.manage')
  @ApiZodBody(GroupLifecycleBody)
  @ApiZodResponse(200, GroupView)
  archive(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(GroupLifecycleBody)) body: Lifecycle,
  ) {
    return this.groups.setArchived(ctx, id, true, body.reason);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequireTenantPermission('group.manage')
  @ApiZodBody(GroupLifecycleBody)
  @ApiZodResponse(200, GroupView)
  reactivate(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(GroupLifecycleBody)) body: Lifecycle,
  ) {
    return this.groups.setArchived(ctx, id, false, body.reason);
  }

  @Get(':id/members')
  @RequireTenantPermission('group.read')
  @ApiZodResponse(200, GroupMemberListPage)
  members(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Query(new ZodValidationPipe(GroupMemberListQuery))
    query: z.output<typeof GroupMemberListQuery>,
  ) {
    return this.groups.listMembers(ctx, id, query);
  }

  @Post(':id/members')
  @HttpCode(200)
  @RequireTenantPermission('group.member.manage')
  @ApiZodBody(AddGroupMembersBody)
  @ApiZodResponse(200, AddGroupMembersResult)
  addMembers(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(AddGroupMembersBody)) body: z.output<typeof AddGroupMembersBody>,
  ) {
    return this.groups.addMembers(ctx, id, body);
  }

  @Post(':id/members/:memberId/remove')
  @HttpCode(200)
  @RequireTenantPermission('group.member.manage')
  @ApiZodBody(RemoveGroupMemberBody)
  @ApiZodResponse(200, GroupMemberView)
  removeMember(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Param('memberId', UuidParamPipe) memberId: string,
    @Body(new ZodValidationPipe(RemoveGroupMemberBody)) body: Lifecycle,
  ) {
    return this.groups.removeMember(ctx, id, memberId, body.reason);
  }
}
