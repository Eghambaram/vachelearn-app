import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CurrentSupportSession,
  StartSupportSessionBody,
  SupportSessionView,
} from '@vachelearn/contracts';
import type { z } from 'zod';
import { ApiZodBody, ApiZodResponse } from '../common/openapi/zod-openapi';
import { UuidParamPipe } from '../common/validation/uuid-param.pipe';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { AllowedDuringSupport, RequirePlatformPermission } from './access.guard';
import { Ctx, type RequestContext } from './request-context';
import { SupportSessionsService } from './support-sessions.service';

/** Platform support sessions (D-037, D-098): platform staff only. Thin: rules live in SupportSessionsService. */
@ApiTags('platform · support sessions')
@Controller('platform/support-sessions')
export class SupportSessionsController {
  constructor(private readonly support: SupportSessionsService) {}

  @Post()
  @RequirePlatformPermission('platform.support_access.start')
  @AllowedDuringSupport()
  @ApiZodBody(StartSupportSessionBody)
  @ApiZodResponse(201, SupportSessionView)
  start(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(StartSupportSessionBody))
    body: z.output<typeof StartSupportSessionBody>,
  ) {
    return this.support.start(ctx, body.tenantId, body.reason);
  }

  @Get('current')
  @RequirePlatformPermission('platform.support_access.start')
  @ApiZodResponse(200, CurrentSupportSession)
  async current(@Ctx() ctx: RequestContext): Promise<CurrentSupportSession> {
    return { data: await this.support.current(ctx) };
  }

  @Post(':id/end')
  @RequirePlatformPermission('platform.support_access.start')
  @AllowedDuringSupport()
  @HttpCode(204)
  async end(@Ctx() ctx: RequestContext, @Param('id', UuidParamPipe) id: string) {
    await this.support.end(ctx, id);
  }
}
