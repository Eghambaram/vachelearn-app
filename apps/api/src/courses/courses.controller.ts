import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CourseAdminListPage,
  CourseAdminListQuery,
  CourseAdminView,
  CreateCourseBody,
  UpdateCourseDraftBody,
} from '@vachelearn/contracts';
import type { z } from 'zod';
import { RequireTenantPermission } from '../access/access.guard';
import { Ctx, type RequestContext } from '../access/request-context';
import { ApiZodBody, ApiZodResponse } from '../common/openapi/zod-openapi';
import { UuidParamPipe } from '../common/validation/uuid-param.pipe';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { CoursesService } from './courses.service';

/** Courses of the caller's own tenant and their drafts (spec §6, D-127–D-130). No tenant id in any route or body. */
@ApiTags('courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  @RequireTenantPermission('course.read')
  @ApiZodResponse(200, CourseAdminListPage)
  list(
    @Ctx() ctx: RequestContext,
    @Query(new ZodValidationPipe(CourseAdminListQuery))
    query: z.output<typeof CourseAdminListQuery>,
  ) {
    return this.courses.list(ctx, query);
  }

  @Get(':id')
  @RequireTenantPermission('course.read')
  @ApiZodResponse(200, CourseAdminView)
  get(@Ctx() ctx: RequestContext, @Param('id', UuidParamPipe) id: string) {
    return this.courses.get(ctx, id);
  }

  @Post()
  @RequireTenantPermission('course.create')
  @ApiZodBody(CreateCourseBody)
  @ApiZodResponse(201, CourseAdminView)
  create(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(CreateCourseBody)) body: z.output<typeof CreateCourseBody>,
  ) {
    return this.courses.create(ctx, body);
  }

  @Patch(':id/draft')
  @RequireTenantPermission('course.update')
  @ApiZodBody(UpdateCourseDraftBody)
  @ApiZodResponse(200, CourseAdminView)
  updateDraft(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(UpdateCourseDraftBody))
    body: z.output<typeof UpdateCourseDraftBody>,
  ) {
    return this.courses.updateDraft(ctx, id, body);
  }
}
