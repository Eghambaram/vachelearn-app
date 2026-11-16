import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CatalogItemLifecycleBody,
  CatalogItemListQuery,
  CategoryListPage,
  CategoryView,
  CreateCategoryBody,
  CreateTagBody,
  TagListPage,
  TagView,
  UpdateCategoryBody,
  UpdateTagBody,
} from '@vachelearn/contracts';
import type { z } from 'zod';
import { RequireTenantPermission } from '../access/access.guard';
import { Ctx, type RequestContext } from '../access/request-context';
import { ApiZodBody, ApiZodResponse } from '../common/openapi/zod-openapi';
import { UuidParamPipe } from '../common/validation/uuid-param.pipe';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { CatalogItemsService } from './catalog-items.service';

type Lifecycle = z.output<typeof CatalogItemLifecycleBody>;

/*
 * Course categories and tags of the caller's own tenant (Slice 3.3, D-128): read with `course.read` (they label and
 * filter courses), changed with `catalog.manage`. No tenant id in any route, query or body.
 */

@ApiTags('catalog')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly items: CatalogItemsService) {}

  @Get()
  @RequireTenantPermission('course.read')
  @ApiZodResponse(200, CategoryListPage)
  list(
    @Ctx() ctx: RequestContext,
    @Query(new ZodValidationPipe(CatalogItemListQuery))
    query: z.output<typeof CatalogItemListQuery>,
  ) {
    return this.items.list(ctx, 'category', query);
  }

  @Post()
  @RequireTenantPermission('catalog.manage')
  @ApiZodBody(CreateCategoryBody)
  @ApiZodResponse(201, CategoryView)
  create(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(CreateCategoryBody)) body: z.output<typeof CreateCategoryBody>,
  ) {
    return this.items.create(ctx, 'category', body.name);
  }

  @Patch(':id')
  @RequireTenantPermission('catalog.manage')
  @ApiZodBody(UpdateCategoryBody)
  @ApiZodResponse(200, CategoryView)
  rename(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(UpdateCategoryBody)) body: z.output<typeof UpdateCategoryBody>,
  ) {
    return this.items.rename(ctx, 'category', id, body);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequireTenantPermission('catalog.manage')
  @ApiZodBody(CatalogItemLifecycleBody)
  @ApiZodResponse(200, CategoryView)
  archive(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(CatalogItemLifecycleBody)) body: Lifecycle,
  ) {
    return this.items.setArchived(ctx, 'category', id, true, body.reason);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequireTenantPermission('catalog.manage')
  @ApiZodBody(CatalogItemLifecycleBody)
  @ApiZodResponse(200, CategoryView)
  reactivate(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(CatalogItemLifecycleBody)) body: Lifecycle,
  ) {
    return this.items.setArchived(ctx, 'category', id, false, body.reason);
  }
}

@ApiTags('catalog')
@Controller('tags')
export class TagsController {
  constructor(private readonly items: CatalogItemsService) {}

  @Get()
  @RequireTenantPermission('course.read')
  @ApiZodResponse(200, TagListPage)
  list(
    @Ctx() ctx: RequestContext,
    @Query(new ZodValidationPipe(CatalogItemListQuery))
    query: z.output<typeof CatalogItemListQuery>,
  ) {
    return this.items.list(ctx, 'tag', query);
  }

  @Post()
  @RequireTenantPermission('catalog.manage')
  @ApiZodBody(CreateTagBody)
  @ApiZodResponse(201, TagView)
  create(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(CreateTagBody)) body: z.output<typeof CreateTagBody>,
  ) {
    return this.items.create(ctx, 'tag', body.name);
  }

  @Patch(':id')
  @RequireTenantPermission('catalog.manage')
  @ApiZodBody(UpdateTagBody)
  @ApiZodResponse(200, TagView)
  rename(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTagBody)) body: z.output<typeof UpdateTagBody>,
  ) {
    return this.items.rename(ctx, 'tag', id, body);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequireTenantPermission('catalog.manage')
  @ApiZodBody(CatalogItemLifecycleBody)
  @ApiZodResponse(200, TagView)
  archive(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(CatalogItemLifecycleBody)) body: Lifecycle,
  ) {
    return this.items.setArchived(ctx, 'tag', id, true, body.reason);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequireTenantPermission('catalog.manage')
  @ApiZodBody(CatalogItemLifecycleBody)
  @ApiZodResponse(200, TagView)
  reactivate(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(CatalogItemLifecycleBody)) body: Lifecycle,
  ) {
    return this.items.setArchived(ctx, 'tag', id, false, body.reason);
  }
}
