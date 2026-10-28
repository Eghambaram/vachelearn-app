import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  BranchListPage,
  BranchListQuery,
  BranchView,
  CreateBranchBody,
  LifecycleBody,
  UpdateBranchBody,
} from '@vachelearn/contracts';
import type { z } from 'zod';
import { RequireTenantPermission } from '../access/access.guard';
import { Ctx, type RequestContext } from '../access/request-context';
import { ApiZodBody, ApiZodResponse } from '../common/openapi/zod-openapi';
import { UuidParamPipe } from '../common/validation/uuid-param.pipe';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { BranchesService } from './branches.service';

/** Branches of the caller's own tenant (spec §4). No tenant id in any route, query or body. */
@ApiTags('branches')
@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @RequireTenantPermission('branch.read')
  @ApiZodResponse(200, BranchListPage)
  list(
    @Ctx() ctx: RequestContext,
    @Query(new ZodValidationPipe(BranchListQuery)) query: z.output<typeof BranchListQuery>,
  ) {
    return this.branches.list(ctx, query);
  }

  @Get(':id')
  @RequireTenantPermission('branch.read')
  @ApiZodResponse(200, BranchView)
  get(@Ctx() ctx: RequestContext, @Param('id', UuidParamPipe) id: string) {
    return this.branches.get(ctx, id);
  }

  @Post()
  @RequireTenantPermission('branch.create')
  @ApiZodBody(CreateBranchBody)
  @ApiZodResponse(201, BranchView)
  create(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(CreateBranchBody)) body: z.output<typeof CreateBranchBody>,
  ) {
    return this.branches.create(ctx, body);
  }

  @Patch(':id')
  @RequireTenantPermission('branch.update')
  @ApiZodBody(UpdateBranchBody)
  @ApiZodResponse(200, BranchView)
  update(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(UpdateBranchBody)) body: z.output<typeof UpdateBranchBody>,
  ) {
    return this.branches.update(ctx, id, body);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequireTenantPermission('branch.deactivate')
  @ApiZodBody(LifecycleBody)
  @ApiZodResponse(200, BranchView)
  deactivate(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(LifecycleBody)) body: LifecycleBody,
  ) {
    return this.branches.setActive(ctx, id, false, body.reason);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequireTenantPermission('branch.deactivate')
  @ApiZodBody(LifecycleBody)
  @ApiZodResponse(200, BranchView)
  reactivate(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(LifecycleBody)) body: LifecycleBody,
  ) {
    return this.branches.setActive(ctx, id, true, body.reason);
  }
}
