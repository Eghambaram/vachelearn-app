import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CreateTenantBody,
  FirstAdminBody,
  FirstAdminResult,
  LifecycleBody,
  TenantListPage,
  TenantListQuery,
  TenantView,
  UpdateTenantBody,
} from '@vachelearn/contracts';
import type { z } from 'zod';
import { RequirePlatformPermission } from '../access/access.guard';
import { Ctx, type RequestContext } from '../access/request-context';
import { ApiZodBody, ApiZodResponse } from '../common/openapi/zod-openapi';
import { UuidParamPipe } from '../common/validation/uuid-param.pipe';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { FirstAdminService } from './first-admin.service';
import { TenantsService } from './tenants.service';

/** Platform tenant management (spec §4, §17): platform staff only. Thin: rules live in TenantsService. */
@ApiTags('platform · tenants')
@Controller('platform/tenants')
export class PlatformTenantsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly firstAdmin: FirstAdminService,
  ) {}

  @Post()
  @RequirePlatformPermission('tenant.create')
  @ApiZodBody(CreateTenantBody)
  @ApiZodResponse(201, TenantView)
  create(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(CreateTenantBody)) body: z.output<typeof CreateTenantBody>,
  ) {
    return this.tenants.create(ctx, body);
  }

  @Get()
  @RequirePlatformPermission('tenant.read')
  @ApiZodResponse(200, TenantListPage)
  list(@Query(new ZodValidationPipe(TenantListQuery)) query: z.output<typeof TenantListQuery>) {
    return this.tenants.list(query);
  }

  @Get(':id')
  @RequirePlatformPermission('tenant.read')
  @ApiZodResponse(200, TenantView)
  get(@Param('id', UuidParamPipe) id: string) {
    return this.tenants.get(id);
  }

  @Patch(':id')
  @RequirePlatformPermission('tenant.update')
  @ApiZodBody(UpdateTenantBody)
  @ApiZodResponse(200, TenantView)
  update(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTenantBody)) body: z.output<typeof UpdateTenantBody>,
  ) {
    return this.tenants.update(ctx, id, body);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @RequirePlatformPermission('tenant.suspend')
  @ApiZodBody(LifecycleBody)
  @ApiZodResponse(200, TenantView)
  suspend(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(LifecycleBody)) body: LifecycleBody,
  ) {
    return this.tenants.transition(ctx, id, 'suspend', body.reason);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequirePlatformPermission('tenant.suspend')
  @ApiZodBody(LifecycleBody)
  @ApiZodResponse(200, TenantView)
  reactivate(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(LifecycleBody)) body: LifecycleBody,
  ) {
    return this.tenants.transition(ctx, id, 'reactivate', body.reason);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePlatformPermission('tenant.archive')
  @ApiZodBody(LifecycleBody)
  @ApiZodResponse(200, TenantView)
  archive(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(LifecycleBody)) body: LifecycleBody,
  ) {
    return this.tenants.transition(ctx, id, 'archive', body.reason);
  }

  /** A new tenant's first Tenant Admin (D-092); 409 once the tenant has one. Reads no tenant data. */
  @Post(':id/first-admin')
  @RequirePlatformPermission('tenant.update')
  @ApiZodBody(FirstAdminBody)
  @ApiZodResponse(201, FirstAdminResult)
  createFirstAdmin(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(FirstAdminBody)) body: z.output<typeof FirstAdminBody>,
  ) {
    return this.firstAdmin.create(ctx, id, body);
  }
}
