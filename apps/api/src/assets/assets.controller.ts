import { Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AssetAccessView, AssetView, UploadAssetQuery } from '@vachelearn/contracts';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { AcceptsFileUpload, RequireTenantPermission } from '../access/access.guard';
import { Ctx, type RequestContext } from '../access/request-context';
import { ApiZodResponse } from '../common/openapi/zod-openapi';
import { UuidParamPipe } from '../common/validation/uuid-param.pipe';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { AssetsService } from './assets.service';

/**
 * Assets of the caller's own tenant (D-131–D-135). Reading routes name `course.read`; the service then applies D-133
 * (Tenant Admins: any asset; course readers: course covers; others 404). No tenant id in any route, query or body.
 */
@ApiTags('assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Post()
  @HttpCode(201)
  @RequireTenantPermission('asset.upload')
  @AcceptsFileUpload()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiZodResponse(201, AssetView)
  upload(
    @Ctx() ctx: RequestContext,
    @Query(new ZodValidationPipe(UploadAssetQuery)) query: z.output<typeof UploadAssetQuery>,
    @Req() req: Request,
  ) {
    return this.assets.upload(ctx, query.kind, req);
  }

  @Get(':id')
  @RequireTenantPermission('course.read')
  @ApiZodResponse(200, AssetView)
  get(@Ctx() ctx: RequestContext, @Param('id', UuidParamPipe) id: string) {
    return this.assets.get(ctx, id);
  }

  /** A signed link valid for 5 minutes (D-135). The link is a secret while it lives: never logged. */
  @Get(':id/access')
  @RequireTenantPermission('course.read')
  @ApiZodResponse(200, AssetAccessView)
  async access(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return this.assets.access(ctx, id);
  }

  /** Redirects to the signed link: what `<img src>` and downloads use, so every load is authorized again. */
  @Get(':id/content')
  @RequireTenantPermission('course.read')
  async content(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Res() res: Response,
  ) {
    const { url } = await this.assets.access(ctx, id);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.redirect(302, url);
  }
}
