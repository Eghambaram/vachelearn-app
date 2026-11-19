import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CourseContentView,
  CreateLessonBody,
  CreateModuleBody,
  DeleteContentQuery,
  LessonDetailView,
  MoveLessonBody,
  ReorderBody,
  UpdateLessonBody,
  UpdateModuleBody,
} from '@vachelearn/contracts';
import type { z } from 'zod';
import { RequireTenantPermission } from '../access/access.guard';
import { Ctx, type RequestContext } from '../access/request-context';
import { ApiZodBody, ApiZodResponse } from '../common/openapi/zod-openapi';
import { UuidParamPipe } from '../common/validation/uuid-param.pipe';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { CourseContentService } from './course-content.service';

/**
 * A course draft's outline (Slice 3.5; D-136–D-139). Reads: every course reader (D-127). Changes: `course.update`
 * (Tenant Admin), each naming the draft `version` and answering with the whole outline. No tenant id anywhere.
 */
@ApiTags('courses')
@Controller('courses/:id/draft')
export class CourseContentController {
  constructor(private readonly content: CourseContentService) {}

  @Get('content')
  @RequireTenantPermission('course.read')
  @ApiZodResponse(200, CourseContentView)
  outline(@Ctx() ctx: RequestContext, @Param('id', UuidParamPipe) id: string) {
    return this.content.content(ctx, id);
  }

  @Get('lessons/:lessonId')
  @RequireTenantPermission('course.read')
  @ApiZodResponse(200, LessonDetailView)
  lesson(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Param('lessonId', UuidParamPipe) lessonId: string,
  ) {
    return this.content.lesson(ctx, id, lessonId);
  }

  @Post('modules')
  @RequireTenantPermission('course.update')
  @ApiZodBody(CreateModuleBody)
  @ApiZodResponse(201, CourseContentView)
  addModule(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(CreateModuleBody)) body: z.output<typeof CreateModuleBody>,
  ) {
    return this.content.addModule(ctx, id, body);
  }

  // Declared before `modules/:moduleId` so "order" is never read as a module id.
  @Put('modules/order')
  @RequireTenantPermission('course.update')
  @ApiZodBody(ReorderBody)
  @ApiZodResponse(200, CourseContentView)
  reorderModules(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(ReorderBody)) body: z.output<typeof ReorderBody>,
  ) {
    return this.content.reorderModules(ctx, id, body);
  }

  @Patch('modules/:moduleId')
  @RequireTenantPermission('course.update')
  @ApiZodBody(UpdateModuleBody)
  @ApiZodResponse(200, CourseContentView)
  renameModule(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Param('moduleId', UuidParamPipe) moduleId: string,
    @Body(new ZodValidationPipe(UpdateModuleBody)) body: z.output<typeof UpdateModuleBody>,
  ) {
    return this.content.renameModule(ctx, id, moduleId, body);
  }

  @Delete('modules/:moduleId')
  @RequireTenantPermission('course.update')
  @ApiZodResponse(200, CourseContentView)
  deleteModule(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Param('moduleId', UuidParamPipe) moduleId: string,
    @Query(new ZodValidationPipe(DeleteContentQuery)) query: z.output<typeof DeleteContentQuery>,
  ) {
    return this.content.deleteModule(ctx, id, moduleId, query.version);
  }

  @Put('modules/:moduleId/lessons/order')
  @RequireTenantPermission('course.update')
  @ApiZodBody(ReorderBody)
  @ApiZodResponse(200, CourseContentView)
  reorderLessons(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Param('moduleId', UuidParamPipe) moduleId: string,
    @Body(new ZodValidationPipe(ReorderBody)) body: z.output<typeof ReorderBody>,
  ) {
    return this.content.reorderLessons(ctx, id, moduleId, body);
  }

  @Post('modules/:moduleId/lessons')
  @RequireTenantPermission('course.update')
  @ApiZodBody(CreateLessonBody)
  @ApiZodResponse(201, CourseContentView)
  addLesson(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Param('moduleId', UuidParamPipe) moduleId: string,
    @Body(new ZodValidationPipe(CreateLessonBody)) body: z.output<typeof CreateLessonBody>,
  ) {
    return this.content.addLesson(ctx, id, moduleId, body);
  }

  @Patch('lessons/:lessonId')
  @RequireTenantPermission('course.update')
  @ApiZodBody(UpdateLessonBody)
  @ApiZodResponse(200, CourseContentView)
  updateLesson(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Param('lessonId', UuidParamPipe) lessonId: string,
    @Body(new ZodValidationPipe(UpdateLessonBody)) body: z.output<typeof UpdateLessonBody>,
  ) {
    return this.content.updateLesson(ctx, id, lessonId, body);
  }

  @Post('lessons/:lessonId/move')
  @HttpCode(200)
  @RequireTenantPermission('course.update')
  @ApiZodBody(MoveLessonBody)
  @ApiZodResponse(200, CourseContentView)
  moveLesson(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Param('lessonId', UuidParamPipe) lessonId: string,
    @Body(new ZodValidationPipe(MoveLessonBody)) body: z.output<typeof MoveLessonBody>,
  ) {
    return this.content.moveLesson(ctx, id, lessonId, body);
  }

  @Delete('lessons/:lessonId')
  @RequireTenantPermission('course.update')
  @ApiZodResponse(200, CourseContentView)
  deleteLesson(
    @Ctx() ctx: RequestContext,
    @Param('id', UuidParamPipe) id: string,
    @Param('lessonId', UuidParamPipe) lessonId: string,
    @Query(new ZodValidationPipe(DeleteContentQuery)) query: z.output<typeof DeleteContentQuery>,
  ) {
    return this.content.deleteLesson(ctx, id, lessonId, query.version);
  }
}
