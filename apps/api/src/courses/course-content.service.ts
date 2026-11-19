import { Injectable } from '@nestjs/common';
import {
  CONTENT_LIMITS,
  LESSON_ASSET_KIND,
  LESSON_COMPLETION_RULE,
  type ContentLesson,
  type CourseContentView,
  type CreateLessonBody,
  type CreateModuleBody,
  type LessonDetailView,
  type LessonMissing,
  type LessonType,
  type MoveLessonBody,
  type ReorderBody,
  type UpdateLessonBody,
  type UpdateModuleBody,
} from '@vachelearn/contracts';
import type { z } from 'zod';
import { reachFor, readsCourses } from '../access/reach';
import type { RequestContext } from '../access/request-context';
import { AuditService, type AuditEntry, type Tx } from '../audit/audit.service';
import { ApiException } from '../common/errors/api-exception';
import { PrismaService } from '../prisma/prisma.service';
import { conflict } from '../tenancy/tenants.service';
import { assertTenantWide, tenantOf } from './courses.service';

/*
 * A course draft's outline: modules and lessons (Slice 3.5; spec §6; D-041, D-136–D-139). Courses belong to the whole
 * tenant, so every course reader (D-127) reads the outline; only tenant-wide `course.update` (checked live) changes
 * it. Every change names the draft's `version` — the token the basics form uses too (D-137) — and bumps it first,
 * which also locks the draft row for the rest of the transaction, so concurrent changes queue and the loser gets 409.
 * Ids from another tenant, another course or another version are 404, never 403. Published versions are frozen by
 * the `course_content_frozen` trigger; positions are kept 0…n-1.
 */

type ModuleTitle = z.output<typeof CreateModuleBody>;
type ModuleRename = z.output<typeof UpdateModuleBody>;
type CreateLesson = z.output<typeof CreateLessonBody>;
type UpdateLesson = z.output<typeof UpdateLessonBody>;
type MoveLesson = z.output<typeof MoveLessonBody>;
type Reorder = z.output<typeof ReorderBody>;

/** Away from 0…n-1 while a list is renumbered, so the `(parent, position)` unique index never collides midway. */
const PARK = 100_000;

type Change = Omit<AuditEntry, 'actorUserId' | 'tenantId' | 'requestId'>;

/** Thrown inside a change that turns out to change nothing: the transaction (and its version bump) rolls back. */
class NoChange extends Error {}
const unchanged = () => new NoChange();
type Draft = { id: string; courseId: string };

const LESSON_SELECT = {
  id: true,
  moduleId: true,
  title: true,
  type: true,
  required: true,
  durationMinutes: true,
  completionRule: true,
  url: true,
  asset: { select: { id: true, kind: true, fileName: true, status: true } },
} as const;

const field = (name: string, code: string, message: string) =>
  ApiException.validation([{ field: name, code, message }]);

const limit = (message: string) => new ApiException(409, 'CONTENT_LIMIT', message);

function missingOf(
  lesson: { type: LessonType; url: string | null; asset: { status: string } | null },
  hasBody: boolean,
): LessonMissing {
  switch (lesson.type) {
    case 'text':
      return hasBody ? null : 'body';
    case 'link':
      return lesson.url ? null : 'url';
    case 'video':
    case 'document':
      return lesson.asset && lesson.asset.status !== 'failed' ? null : 'file';
    case 'assessment':
      // Connected to an assessment in Phase 4.4 (D-136).
      return 'assessment';
  }
}

/** The content fields a lesson type takes (D-136); any other one sent is a 422 naming it. */
function assertFieldsFit(
  type: LessonType,
  input: { body?: unknown; url?: unknown; assetId?: unknown },
) {
  if (input.body !== undefined && type !== 'text') {
    throw field('body', 'not_for_type', 'Only text lessons have text');
  }
  if (input.url !== undefined && type !== 'link') {
    throw field('url', 'not_for_type', 'Only link lessons have a web address');
  }
  if (input.assetId !== undefined && !LESSON_ASSET_KIND[type]) {
    throw field('assetId', 'not_for_type', 'Only video and document lessons have a file');
  }
}

/** D-136: the file is this tenant's, of the lesson's kind, and not failed. Another tenant's id reads as unknown. */
async function assertAsset(tx: Tx, tenantId: string, type: LessonType, assetId: string) {
  const asset = await tx.asset.findFirst({
    where: { id: assetId, tenantId },
    select: { kind: true, status: true },
  });
  if (!asset) throw field('assetId', 'not_found', 'Upload the file again');
  if (asset.kind !== LESSON_ASSET_KIND[type]) {
    throw field('assetId', 'wrong_kind', `A ${type} lesson needs a ${type} file`);
  }
  if (asset.status === 'failed')
    throw field('assetId', 'failed', 'This file could not be processed');
}

/** The ids must be exactly the current list, in a new order. */
function assertPermutation(current: readonly string[], ids: readonly string[]) {
  const set = new Set(ids);
  if (
    set.size !== ids.length ||
    ids.length !== current.length ||
    current.some((id) => !set.has(id))
  ) {
    throw field('ids', 'not_a_permutation', 'Send every item exactly once');
  }
}

@Injectable()
export class CourseContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Reads (every course reader, D-127) ──────────────────────────────────────────────────────────────────────────

  async content(ctx: RequestContext, courseId: string): Promise<CourseContentView> {
    const tenantId = tenantOf(ctx);
    if (!readsCourses(ctx)) throw ApiException.notFound();
    return this.prisma.$transaction(async (tx) => {
      const draft = await this.findDraft(tx, tenantId, courseId);
      return this.view(ctx, tx, tenantId, draft);
    });
  }

  async lesson(ctx: RequestContext, courseId: string, lessonId: string): Promise<LessonDetailView> {
    const tenantId = tenantOf(ctx);
    if (!readsCourses(ctx)) throw ApiException.notFound();
    return this.prisma.$transaction(async (tx) => {
      const draft = await this.findDraft(tx, tenantId, courseId);
      const lesson = await tx.lesson.findFirst({
        where: { id: lessonId, tenantId, courseVersionId: draft.id },
        select: { ...LESSON_SELECT, body: true },
      });
      if (!lesson) throw ApiException.notFound();
      const { version } = await tx.courseVersion.findFirstOrThrow({
        where: { id: draft.id, tenantId },
        select: { version: true },
      });
      const { body, ...rest } = lesson;
      return { ...this.lessonView(rest, body !== null), moduleId: rest.moduleId, body, version };
    });
  }

  // ── Modules ─────────────────────────────────────────────────────────────────────────────────────────────────────

  addModule(ctx: RequestContext, courseId: string, input: ModuleTitle) {
    return this.change(ctx, courseId, input.version, async (tx, tenantId, draft) => {
      const count = await tx.courseModule.count({ where: { tenantId, courseVersionId: draft.id } });
      if (count >= CONTENT_LIMITS.modules) {
        throw limit(`A course has at most ${CONTENT_LIMITS.modules} modules`);
      }
      const created = await tx.courseModule.create({
        data: { tenantId, courseVersionId: draft.id, position: count, title: input.title },
        select: { id: true },
      });
      return {
        action: 'course_module.created',
        entityType: 'course_module',
        entityId: created.id,
        after: { courseId, title: input.title, position: count },
      };
    });
  }

  renameModule(ctx: RequestContext, courseId: string, moduleId: string, input: ModuleRename) {
    return this.change(ctx, courseId, input.version, async (tx, tenantId, draft) => {
      const mod = await this.findModule(tx, tenantId, draft, moduleId);
      if (mod.title === input.title) throw unchanged();
      await tx.courseModule.updateMany({
        where: { id: mod.id, tenantId, courseVersionId: draft.id },
        data: { title: input.title },
      });
      return {
        action: 'course_module.renamed',
        entityType: 'course_module',
        entityId: mod.id,
        before: { courseId, title: mod.title },
        after: { courseId, title: input.title },
      };
    });
  }

  deleteModule(ctx: RequestContext, courseId: string, moduleId: string, version: number) {
    return this.change(ctx, courseId, version, async (tx, tenantId, draft) => {
      const mod = await this.findModule(tx, tenantId, draft, moduleId);
      const lessons = await tx.lesson.count({ where: { tenantId, moduleId: mod.id } });
      // Drafts are not learning evidence (D-137): the module and its lessons go.
      await tx.courseModule.deleteMany({
        where: { id: mod.id, tenantId, courseVersionId: draft.id },
      });
      await this.renumberModules(tx, tenantId, draft.id);
      return {
        action: 'course_module.deleted',
        entityType: 'course_module',
        entityId: mod.id,
        before: { courseId, title: mod.title, lessons },
      };
    });
  }

  reorderModules(ctx: RequestContext, courseId: string, input: Reorder) {
    return this.change(ctx, courseId, input.version, async (tx, tenantId, draft) => {
      const current = await tx.courseModule.findMany({
        where: { tenantId, courseVersionId: draft.id },
        orderBy: { position: 'asc' },
        select: { id: true },
      });
      const before = current.map((m) => m.id);
      assertPermutation(before, input.ids);
      if (before.every((id, i) => id === input.ids[i])) throw unchanged();
      await this.renumberModules(tx, tenantId, draft.id, input.ids);
      return {
        action: 'course.modules_reordered',
        entityType: 'course',
        entityId: courseId,
        before: { moduleIds: before },
        after: { moduleIds: input.ids },
      };
    });
  }

  // ── Lessons ─────────────────────────────────────────────────────────────────────────────────────────────────────

  addLesson(ctx: RequestContext, courseId: string, moduleId: string, input: CreateLesson) {
    return this.change(ctx, courseId, input.version, async (tx, tenantId, draft) => {
      const mod = await this.findModule(tx, tenantId, draft, moduleId);
      assertFieldsFit(input.type, input);
      if (input.assetId) await assertAsset(tx, tenantId, input.type, input.assetId);
      const inModule = await tx.lesson.count({ where: { tenantId, moduleId: mod.id } });
      if (inModule >= CONTENT_LIMITS.lessonsPerModule) {
        throw limit(`A module has at most ${CONTENT_LIMITS.lessonsPerModule} lessons`);
      }
      const inVersion = await tx.lesson.count({ where: { tenantId, courseVersionId: draft.id } });
      if (inVersion >= CONTENT_LIMITS.lessonsPerVersion) {
        throw limit(`A course has at most ${CONTENT_LIMITS.lessonsPerVersion} lessons`);
      }
      const created = await tx.lesson.create({
        data: {
          tenantId,
          courseVersionId: draft.id,
          moduleId: mod.id,
          position: inModule,
          title: input.title,
          type: input.type,
          completionRule: LESSON_COMPLETION_RULE[input.type],
          required: input.required ?? true,
          durationMinutes: input.durationMinutes ?? null,
          body: input.body ?? null,
          url: input.url ?? null,
          assetId: input.assetId ?? null,
        },
        select: { id: true },
      });
      return {
        action: 'lesson.created',
        entityType: 'lesson',
        entityId: created.id,
        after: {
          courseId,
          moduleId: mod.id,
          title: input.title,
          type: input.type,
          required: input.required ?? true,
          ...(input.assetId ? { assetId: input.assetId } : {}),
          // Text and addresses are recorded as set, never by value.
          ...(input.body ? { body: '[set]' } : {}),
          ...(input.url ? { url: '[set]' } : {}),
        },
      };
    });
  }

  updateLesson(ctx: RequestContext, courseId: string, lessonId: string, input: UpdateLesson) {
    const { version, ...patch } = input;
    return this.change(ctx, courseId, version, async (tx, tenantId, draft) => {
      const lesson = await this.findLesson(tx, tenantId, draft, lessonId);
      assertFieldsFit(lesson.type, patch);
      if (patch.assetId && patch.assetId !== lesson.assetId) {
        await assertAsset(tx, tenantId, lesson.type, patch.assetId);
      }
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const key of ['title', 'required', 'durationMinutes', 'assetId'] as const) {
        if (patch[key] !== undefined && patch[key] !== lesson[key]) {
          before[key] = lesson[key];
          after[key] = patch[key];
        }
      }
      for (const key of ['body', 'url'] as const) {
        if (patch[key] !== undefined && patch[key] !== lesson[key]) {
          before[key] = lesson[key] === null ? null : '[set]';
          after[key] = patch[key] === null ? null : '[changed]';
        }
      }
      if (Object.keys(after).length === 0) throw unchanged();
      // Only these fields, named one by one: a field added to the contract later is never written by accident.
      await tx.lesson.updateMany({
        where: { id: lesson.id, tenantId, courseVersionId: draft.id },
        data: {
          title: patch.title,
          required: patch.required,
          durationMinutes: patch.durationMinutes,
          body: patch.body,
          url: patch.url,
          assetId: patch.assetId,
        },
      });
      return {
        action: 'lesson.updated',
        entityType: 'lesson',
        entityId: lesson.id,
        before: { courseId, ...before },
        after: { courseId, ...after },
      };
    });
  }

  moveLesson(ctx: RequestContext, courseId: string, lessonId: string, input: MoveLesson) {
    return this.change(ctx, courseId, input.version, async (tx, tenantId, draft) => {
      const lesson = await this.findLesson(tx, tenantId, draft, lessonId);
      const target = await this.findModule(tx, tenantId, draft, input.moduleId);
      const ids = async (moduleId: string) =>
        (
          await tx.lesson.findMany({
            where: { tenantId, moduleId },
            orderBy: { position: 'asc' },
            select: { id: true },
          })
        ).map((l) => l.id);
      const source = (await ids(lesson.moduleId)).filter((id) => id !== lesson.id);
      const into = target.id === lesson.moduleId ? source : await ids(target.id);
      if (target.id !== lesson.moduleId && into.length >= CONTENT_LIMITS.lessonsPerModule) {
        throw limit(`A module has at most ${CONTENT_LIMITS.lessonsPerModule} lessons`);
      }
      const at = Math.min(input.position, into.length);
      const placed = [...into.slice(0, at), lesson.id, ...into.slice(at)];
      if (target.id === lesson.moduleId && at === lesson.position) throw unchanged();
      if (target.id === lesson.moduleId) {
        await this.renumberLessons(tx, tenantId, draft.id, [{ moduleId: target.id, ids: placed }]);
      } else {
        await this.renumberLessons(tx, tenantId, draft.id, [
          { moduleId: lesson.moduleId, ids: source },
          { moduleId: target.id, ids: placed },
        ]);
      }
      return {
        action: 'lesson.moved',
        entityType: 'lesson',
        entityId: lesson.id,
        before: { courseId, moduleId: lesson.moduleId, position: lesson.position },
        after: { courseId, moduleId: target.id, position: at },
      };
    });
  }

  reorderLessons(ctx: RequestContext, courseId: string, moduleId: string, input: Reorder) {
    return this.change(ctx, courseId, input.version, async (tx, tenantId, draft) => {
      const mod = await this.findModule(tx, tenantId, draft, moduleId);
      const current = (
        await tx.lesson.findMany({
          where: { tenantId, moduleId: mod.id },
          orderBy: { position: 'asc' },
          select: { id: true },
        })
      ).map((l) => l.id);
      assertPermutation(current, input.ids);
      if (current.every((id, i) => id === input.ids[i])) throw unchanged();
      await this.renumberLessons(tx, tenantId, draft.id, [{ moduleId: mod.id, ids: input.ids }]);
      return {
        action: 'course_module.lessons_reordered',
        entityType: 'course_module',
        entityId: mod.id,
        before: { courseId, lessonIds: current },
        after: { courseId, lessonIds: input.ids },
      };
    });
  }

  deleteLesson(ctx: RequestContext, courseId: string, lessonId: string, version: number) {
    return this.change(ctx, courseId, version, async (tx, tenantId, draft) => {
      const lesson = await this.findLesson(tx, tenantId, draft, lessonId);
      await tx.lesson.deleteMany({ where: { id: lesson.id, tenantId, courseVersionId: draft.id } });
      const rest = await tx.lesson.findMany({
        where: { tenantId, moduleId: lesson.moduleId },
        orderBy: { position: 'asc' },
        select: { id: true },
      });
      await this.renumberLessons(tx, tenantId, draft.id, [
        { moduleId: lesson.moduleId, ids: rest.map((l) => l.id) },
      ]);
      return {
        action: 'lesson.deleted',
        entityType: 'lesson',
        entityId: lesson.id,
        before: { courseId, moduleId: lesson.moduleId, title: lesson.title, type: lesson.type },
      };
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * One outline change: live tenant-wide `course.update`, an active course with a draft at the named version. The
   * version is bumped first (locking the draft row), then the change runs, is audited, and the new outline returned.
   */
  private async change(
    ctx: RequestContext,
    courseId: string,
    version: number,
    run: (tx: Tx, tenantId: string, draft: Draft) => Promise<Change>,
  ): Promise<CourseContentView> {
    try {
      return await this.changeInTransaction(ctx, courseId, version, run);
    } catch (err) {
      // Nothing to change (same title, same order, same values): no new token, no audit entry, the outline as it is.
      if (err instanceof NoChange) return this.content(ctx, courseId);
      throw err;
    }
  }

  private changeInTransaction(
    ctx: RequestContext,
    courseId: string,
    version: number,
    run: (tx: Tx, tenantId: string, draft: Draft) => Promise<Change>,
  ): Promise<CourseContentView> {
    const tenantId = tenantOf(ctx);
    return this.prisma.$transaction(async (tx) => {
      await assertTenantWide(tx, ctx, tenantId, 'course.update');
      const draft = await this.findDraft(tx, tenantId, courseId, { editing: true });
      const bumped = await tx.courseVersion.updateMany({
        where: { id: draft.id, tenantId, status: 'draft', version },
        data: { version: { increment: 1 }, updatedById: ctx.userId },
      });
      if (bumped.count === 0) throw conflict();
      const entry = await run(tx, tenantId, draft);
      // "Recently updated" in the course list follows outline changes too.
      await tx.course.updateMany({
        where: { id: courseId, tenantId },
        data: { updatedAt: new Date() },
      });
      await this.audit.record(tx, {
        ...entry,
        actorUserId: ctx.userId,
        tenantId,
        requestId: ctx.requestId,
      });
      return this.view(ctx, tx, tenantId, draft);
    });
  }

  private async findDraft(
    tx: Tx,
    tenantId: string,
    courseId: string,
    { editing = false } = {},
  ): Promise<Draft> {
    const course = await tx.course.findFirst({
      where: { id: courseId, tenantId },
      select: { id: true, status: true },
    });
    if (!course) throw ApiException.notFound();
    if (editing && course.status !== 'active') {
      throw new ApiException(409, 'COURSE_ARCHIVED', 'An archived course cannot be edited');
    }
    const draft = await tx.courseVersion.findFirst({
      where: { tenantId, courseId, status: 'draft' },
      select: { id: true },
    });
    // Creating a draft from the published version comes with publishing (3.6).
    if (!draft) throw new ApiException(409, 'NO_DRAFT', 'This course has no draft to edit');
    return { id: draft.id, courseId };
  }

  private async findModule(tx: Tx, tenantId: string, draft: Draft, moduleId: string) {
    const mod = await tx.courseModule.findFirst({
      where: { id: moduleId, tenantId, courseVersionId: draft.id },
      select: { id: true, title: true },
    });
    if (!mod) throw ApiException.notFound();
    return mod;
  }

  private async findLesson(tx: Tx, tenantId: string, draft: Draft, lessonId: string) {
    const lesson = await tx.lesson.findFirst({
      where: { id: lessonId, tenantId, courseVersionId: draft.id },
      select: {
        id: true,
        moduleId: true,
        position: true,
        title: true,
        type: true,
        required: true,
        durationMinutes: true,
        body: true,
        url: true,
        assetId: true,
      },
    });
    if (!lesson) throw ApiException.notFound();
    return lesson;
  }

  /** Modules to 0…n-1 in the given order (default: the current one, closing gaps after a delete). */
  private async renumberModules(
    tx: Tx,
    tenantId: string,
    versionId: string,
    order?: readonly string[],
  ) {
    const ids =
      order ??
      (
        await tx.courseModule.findMany({
          where: { tenantId, courseVersionId: versionId },
          orderBy: { position: 'asc' },
          select: { id: true },
        })
      ).map((m) => m.id);
    await tx.courseModule.updateMany({
      where: { tenantId, courseVersionId: versionId },
      data: { position: { increment: PARK } },
    });
    for (const [position, id] of ids.entries()) {
      await tx.courseModule.updateMany({
        where: { id, tenantId, courseVersionId: versionId },
        data: { position },
      });
    }
  }

  /** Each listed module's lessons to 0…n-1 in the given order (a moved lesson changes module here). */
  private async renumberLessons(
    tx: Tx,
    tenantId: string,
    versionId: string,
    lists: readonly { moduleId: string; ids: readonly string[] }[],
  ) {
    const all = lists.flatMap((l) => l.ids);
    if (all.length > 0) {
      await tx.lesson.updateMany({
        where: { tenantId, courseVersionId: versionId, id: { in: all } },
        data: { position: { increment: PARK } },
      });
    }
    for (const list of lists) {
      for (const [position, id] of list.ids.entries()) {
        await tx.lesson.updateMany({
          where: { id, tenantId, courseVersionId: versionId },
          data: { position, moduleId: list.moduleId },
        });
      }
    }
  }

  private lessonView(
    lesson: {
      id: string;
      title: string;
      type: LessonType;
      required: boolean;
      durationMinutes: number | null;
      completionRule: ContentLesson['completionRule'];
      url: string | null;
      asset: ContentLesson['asset'];
    },
    hasBody: boolean,
  ) {
    return {
      id: lesson.id,
      title: lesson.title,
      type: lesson.type,
      required: lesson.required,
      durationMinutes: lesson.durationMinutes,
      completionRule: lesson.completionRule,
      url: lesson.url,
      asset: lesson.asset,
      missing: missingOf(lesson, hasBody),
    };
  }

  private async view(
    ctx: RequestContext,
    tx: Tx,
    tenantId: string,
    draft: Draft,
  ): Promise<CourseContentView> {
    const version = await tx.courseVersion.findFirstOrThrow({
      where: { id: draft.id, tenantId },
      select: { version: true, title: true },
    });
    const modules = await tx.courseModule.findMany({
      where: { tenantId, courseVersionId: draft.id },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        title: true,
        lessons: { orderBy: { position: 'asc' }, select: LESSON_SELECT },
      },
    });
    // Which text lessons have text, without loading up to 500 × 20,000 characters.
    const withBody = new Set(
      (
        await tx.lesson.findMany({
          where: { tenantId, courseVersionId: draft.id, type: 'text', body: { not: null } },
          select: { id: true },
        })
      ).map((l) => l.id),
    );
    let lessons = 0;
    let durationMinutes = 0;
    const shaped = modules.map((m) => ({
      id: m.id,
      title: m.title,
      lessons: m.lessons.map((l) => {
        lessons += 1;
        durationMinutes += l.durationMinutes ?? 0;
        return this.lessonView(l, withBody.has(l.id));
      }),
    }));
    return {
      courseId: draft.courseId,
      courseTitle: version.title,
      version: version.version,
      canEdit: reachFor(ctx, 'course.update')?.kind === 'tenant',
      modules: shaped,
      totals: { modules: modules.length, lessons, durationMinutes },
    };
  }
}
