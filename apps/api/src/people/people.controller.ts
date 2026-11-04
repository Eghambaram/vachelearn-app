import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CreateJobRoleBody,
  JobRoleListPage,
  JobRoleListQuery,
  JobRoleView,
  LifecycleBody,
  PeopleListPage,
  PeopleListQuery,
  PersonBranchBody,
  PersonView,
  TenantSettingsView,
  UpdateJobRoleBody,
  UpdatePersonBody,
  UpdateTenantSettingsBody,
} from '@vachelearn/contracts';
import type { z } from 'zod';
import { RequireTenantPermission } from '../access/access.guard';
import { RecordSupportView } from '../audit/support-view.interceptor';
import { Ctx, type RequestContext } from '../access/request-context';
import { ApiZodBody, ApiZodResponse } from '../common/openapi/zod-openapi';
import { UuidParamPipe } from '../common/validation/uuid-param.pipe';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { JobRolesService } from './job-roles.service';
import { PeopleService } from './people.service';
import { TenantSettingsService } from './tenant-settings.service';

/** Members of the caller's own tenant (Slice 2.5a), by membership id. No tenant id in any route, query or body. */
@ApiTags('people')
@Controller('people')
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  @RequireTenantPermission('user.read')
  @ApiZodResponse(200, PeopleListPage)
  list(
    @Ctx() ctx: RequestContext,
    @Query(new ZodValidationPipe(PeopleListQuery)) query: z.output<typeof PeopleListQuery>,
  ) {
    return this.people.list(ctx, query);
  }

  @Get(':id')
  @RequireTenantPermission('user.read')
  @RecordSupportView('membership', 'membershipId')
  @ApiZodResponse(200, PersonView)
  get(@Ctx() ctx: RequestContext, @Param('id', UuidParamPipe) id: string) {
    return this.people.get(ctx, id);
  }

  @Patch(':id')
  @RequireTenantPermission('user.update')
  @ApiZodBody(UpdatePersonBody)
  @ApiZodResponse(200, PersonView)
  update(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(UpdatePersonBody)) body: z.output<typeof UpdatePersonBody>,
  ) {
    return this.people.update(ctx, id, body);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequireTenantPermission('user.deactivate')
  @ApiZodBody(LifecycleBody)
  @ApiZodResponse(200, PersonView)
  deactivate(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(LifecycleBody)) body: LifecycleBody,
  ) {
    return this.people.setActive(ctx, id, false, body.reason);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequireTenantPermission('user.reactivate')
  @ApiZodBody(LifecycleBody)
  @ApiZodResponse(200, PersonView)
  reactivate(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(LifecycleBody)) body: LifecycleBody,
  ) {
    return this.people.setActive(ctx, id, true, body.reason);
  }

  @Post(':id/branches')
  @HttpCode(200)
  @RequireTenantPermission('membership.branch.manage')
  @ApiZodBody(PersonBranchBody)
  @ApiZodResponse(200, PersonView)
  addBranch(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(PersonBranchBody)) body: PersonBranchBody,
  ) {
    return this.people.addBranch(ctx, id, body.branchId);
  }

  @Post(':id/branches/:branchId/remove')
  @HttpCode(204)
  @RequireTenantPermission('membership.branch.manage')
  async removeBranch(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Param('branchId', UuidParamPipe) branchId: string,
  ) {
    await this.people.removeBranch(ctx, id, branchId);
  }

  @Post(':id/primary-branch')
  @HttpCode(200)
  @RequireTenantPermission('membership.branch.manage')
  @ApiZodBody(PersonBranchBody)
  @ApiZodResponse(200, PersonView)
  setPrimaryBranch(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(PersonBranchBody)) body: PersonBranchBody,
  ) {
    return this.people.setPrimaryBranch(ctx, id, body.branchId);
  }
}

/** The tenant's job-role list (D-047). */
@ApiTags('job-roles')
@Controller('job-roles')
export class JobRolesController {
  constructor(private readonly jobRoles: JobRolesService) {}

  @Get()
  @RequireTenantPermission('tenant_settings.read')
  @ApiZodResponse(200, JobRoleListPage)
  list(
    @Ctx() ctx: RequestContext,
    @Query(new ZodValidationPipe(JobRoleListQuery)) query: z.output<typeof JobRoleListQuery>,
  ) {
    return this.jobRoles.list(ctx, query);
  }

  @Post()
  @RequireTenantPermission('reference_data.manage')
  @ApiZodBody(CreateJobRoleBody)
  @ApiZodResponse(201, JobRoleView)
  create(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(CreateJobRoleBody)) body: z.output<typeof CreateJobRoleBody>,
  ) {
    return this.jobRoles.create(ctx, body);
  }

  @Patch(':id')
  @RequireTenantPermission('reference_data.manage')
  @ApiZodBody(UpdateJobRoleBody)
  @ApiZodResponse(200, JobRoleView)
  rename(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(UpdateJobRoleBody)) body: z.output<typeof UpdateJobRoleBody>,
  ) {
    return this.jobRoles.rename(ctx, id, body);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequireTenantPermission('reference_data.manage')
  @ApiZodBody(LifecycleBody)
  @ApiZodResponse(200, JobRoleView)
  deactivate(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(LifecycleBody)) body: LifecycleBody,
  ) {
    return this.jobRoles.setActive(ctx, id, false, body.reason);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequireTenantPermission('reference_data.manage')
  @ApiZodBody(LifecycleBody)
  @ApiZodResponse(200, JobRoleView)
  reactivate(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(LifecycleBody)) body: LifecycleBody,
  ) {
    return this.jobRoles.setActive(ctx, id, true, body.reason);
  }
}

/** The caller's own tenant settings. */
@ApiTags('tenant-settings')
@Controller('tenant-settings')
export class TenantSettingsController {
  constructor(private readonly settings: TenantSettingsService) {}

  @Get()
  @RequireTenantPermission('tenant_settings.read')
  @ApiZodResponse(200, TenantSettingsView)
  get(@Ctx() ctx: RequestContext) {
    return this.settings.get(ctx);
  }

  @Patch()
  @RequireTenantPermission('tenant_settings.update')
  @ApiZodBody(UpdateTenantSettingsBody)
  @ApiZodResponse(200, TenantSettingsView)
  update(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(UpdateTenantSettingsBody))
    body: z.output<typeof UpdateTenantSettingsBody>,
  ) {
    return this.settings.update(ctx, body);
  }
}
