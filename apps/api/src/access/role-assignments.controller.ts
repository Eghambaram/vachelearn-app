import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CreateRoleAssignmentBody,
  RevokeRoleAssignmentBody,
  RoleAssignmentList,
  RoleAssignmentListQuery,
  RoleAssignmentView,
} from '@vachelearn/contracts';
import type { z } from 'zod';
import { ApiZodBody, ApiZodResponse } from '../common/openapi/zod-openapi';
import { UuidParamPipe } from '../common/validation/uuid-param.pipe';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { RequireTenantPermission } from './access.guard';
import { Ctx, type RequestContext } from './request-context';
import { RoleAssignmentsService } from './role-assignments.service';

/** Role assignment inside the caller's tenant (2.4b; matrix "Granting rules"). Thin: rules live in the service. */
@ApiTags('role assignments')
@Controller('role-assignments')
export class RoleAssignmentsController {
  constructor(private readonly roles: RoleAssignmentsService) {}

  @Get()
  @RequireTenantPermission('role.assign')
  @ApiZodResponse(200, RoleAssignmentList)
  async list(
    @Ctx() ctx: RequestContext,
    @Query(new ZodValidationPipe(RoleAssignmentListQuery))
    query: z.output<typeof RoleAssignmentListQuery>,
  ) {
    return { data: await this.roles.list(ctx, query.membershipId) };
  }

  @Post()
  @RequireTenantPermission('role.assign')
  @ApiZodBody(CreateRoleAssignmentBody)
  @ApiZodResponse(201, RoleAssignmentView)
  assign(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(CreateRoleAssignmentBody))
    body: z.output<typeof CreateRoleAssignmentBody>,
  ) {
    return this.roles.assign(ctx, body);
  }

  @Post(':id/revoke')
  @RequireTenantPermission('role.assign')
  @HttpCode(200)
  @ApiZodBody(RevokeRoleAssignmentBody)
  @ApiZodResponse(200, RoleAssignmentView)
  revoke(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(RevokeRoleAssignmentBody))
    body: z.output<typeof RevokeRoleAssignmentBody>,
  ) {
    return this.roles.revoke(ctx, id, body.reason);
  }
}
