import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AcceptedInvitation,
  AcceptExistingInvitationBody,
  AcceptInvitationBody,
  CreateInvitationBody,
  InvitationListPage,
  InvitationListQuery,
  InvitationPreview,
  InvitationPreviewBody,
  InvitationView,
  RevokeInvitationBody,
} from '@vachelearn/contracts';
import type { Request } from 'express';
import type { z } from 'zod';
import { Authenticated, Public, RequireTenantPermission } from '../access/access.guard';
import { Ctx, type RequestContext } from '../access/request-context';
import { ApiZodBody, ApiZodResponse } from '../common/openapi/zod-openapi';
import { requestIdOf } from '../common/request-id';
import { UuidParamPipe } from '../common/validation/uuid-param.pipe';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { InvitationsService } from './invitations.service';

/**
 * Invitations (Slice 3.1). Inviter routes act in the caller's own tenant (never a tenant id from the request); the
 * link routes find the invitation by its token alone. `req.ip` honours exactly TRUST_PROXY_HOPS proxies.
 */
@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  @RequireTenantPermission('invitation.read')
  @ApiZodResponse(200, InvitationListPage)
  list(
    @Ctx() ctx: RequestContext,
    @Query(new ZodValidationPipe(InvitationListQuery)) query: z.output<typeof InvitationListQuery>,
  ) {
    return this.invitations.list(ctx, query);
  }

  @Post()
  @RequireTenantPermission('invitation.create')
  @ApiZodBody(CreateInvitationBody)
  @ApiZodResponse(201, InvitationView)
  create(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(CreateInvitationBody)) body: z.output<typeof CreateInvitationBody>,
  ) {
    return this.invitations.create(ctx, body);
  }

  @Post(':id/resend')
  @HttpCode(200)
  @RequireTenantPermission('invitation.create')
  @ApiZodResponse(200, InvitationView)
  resend(@Ctx() ctx: RequestContext, @Param('id', UuidParamPipe) id: string) {
    return this.invitations.resend(ctx, id);
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @RequireTenantPermission('invitation.revoke')
  @ApiZodBody(RevokeInvitationBody)
  @ApiZodResponse(200, InvitationView)
  revoke(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(RevokeInvitationBody)) body: z.output<typeof RevokeInvitationBody>,
  ) {
    return this.invitations.revoke(ctx, id, body.reason);
  }

  @Post('preview')
  @Public()
  @HttpCode(200)
  @ApiZodBody(InvitationPreviewBody)
  @ApiZodResponse(200, InvitationPreview)
  preview(
    @Req() req: Request,
    @Body(new ZodValidationPipe(InvitationPreviewBody))
    body: z.output<typeof InvitationPreviewBody>,
  ) {
    return this.invitations.preview(body, req.ip ?? 'unknown');
  }

  @Post('accept')
  @Public()
  @HttpCode(201)
  @ApiZodBody(AcceptInvitationBody)
  @ApiZodResponse(201, AcceptedInvitation)
  accept(
    @Req() req: Request,
    @Body(new ZodValidationPipe(AcceptInvitationBody)) body: z.output<typeof AcceptInvitationBody>,
  ) {
    return this.invitations.accept(body, req.ip ?? 'unknown', requestIdOf(req));
  }
}

/**
 * The signed-in person accepts an invitation to their own address (D-116): under `me/`, the only place `@Authenticated()`
 * routes live (security review 2.3b). Gains exactly the invited membership and role.
 */
@ApiTags('invitations')
@Controller('me/invitations')
export class MyInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('accept')
  @Authenticated()
  @HttpCode(201)
  @ApiZodBody(AcceptExistingInvitationBody)
  @ApiZodResponse(201, AcceptedInvitation)
  acceptExisting(
    @Ctx() ctx: RequestContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(AcceptExistingInvitationBody))
    body: z.output<typeof AcceptExistingInvitationBody>,
  ) {
    return this.invitations.acceptExisting(ctx, body, req.ip ?? 'unknown');
  }
}
