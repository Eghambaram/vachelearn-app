import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditEventListPage, AuditEventListQuery } from '@vachelearn/contracts';
import type { z } from 'zod';
import { RequireTenantPermission } from '../access/access.guard';
import { Ctx, type RequestContext } from '../access/request-context';
import { ApiZodResponse } from '../common/openapi/zod-openapi';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { AuditLogService } from './audit-log.service';

/** The caller's own tenant audit log (Slice 2.6a). No tenant id in the route or query. */
@ApiTags('audit')
@Controller('audit-events')
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  @RequireTenantPermission('audit.read')
  @ApiZodResponse(200, AuditEventListPage)
  list(
    @Ctx() ctx: RequestContext,
    @Query(new ZodValidationPipe(AuditEventListQuery)) query: z.output<typeof AuditEventListQuery>,
  ) {
    return this.auditLog.list(ctx, query);
  }
}
