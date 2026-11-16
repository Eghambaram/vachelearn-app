import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CourseAdminListItem,
  CourseAdminListPage,
  CourseAdminListQuery,
  CourseAdminView,
  CourseDraftView,
  CourseStatus,
  CreateCourseBody,
  UpdateCourseDraftBody,
} from '@vachelearn/contracts';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';
import { liveReach, reachFor } from '../access/reach';
import type { RequestContext } from '../access/request-context';
import { lockTenant } from '../access/tenant-admins';
import { AuditService, changedFields, type Tx } from '../audit/audit.service';
import { ApiException } from '../common/errors/api-exception';
import { CURSORS, Cursors, afterCursor, queryKey } from '../common/pagination/keyset';
import { isUniqueViolation } from '../prisma/errors';
import { PrismaService } from '../prisma/prisma.service';
import { conflict } from '../tenancy/tenants.service';

/*
 * Courses and their drafts (Slice 3.3; spec §6; D-127–D-130). A course belongs to the whole tenant — no branch — so
 * every `course.read` holder with tenant or branch reach sees every course, drafts included, read-only (D-127); an
 * Instructor (`A`: assigned sessions, none before 5.5) sees none. Only `course.create` / `course.update` (Tenant
 * Admin, `T`) create courses and edit drafts. A course's metadata lives on its versions: at most one draft (partial
 * unique index), published versions immutable (trigger; publishing is 3.6). The course row keeps the listing title in
 * step with the draft in the same transaction. Draft edits name the version they read (stale → 409 `CONFLICT`).
 */

type ListInput = z.output<typeof CourseAdminListQuery>;
type CreateInput = z.output<typeof CreateCourseBody>;
type UpdateInput = z.output<typeof UpdateCourseDraftBody>;

const ITEM_REF = { select: { id: true, name: true, status: true } } as const;

/** The draft (if any) first, then the latest published version: enough for the list row and the detail header. */
const SHOWN_VERSIONS = {
  orderBy: [{ status: 'asc' }, { versionNumber: 'desc' }],
  take: 2,
  select: {
    id: true,
    status: true,
    versionNumber: true,
    title: true,
    level: true,
    deliveryMode: true,
    language: true,
    durationMinutes: true,
    category: ITEM_REF,
  },
} satisfies Prisma.Course$versionsArgs;

const DRAFT_SELECT = {
  id: true,
  version: true,
  title: true,
  summary: true,
  description: true,
  level: true,
  deliveryMode: true,
  language: true,
  durationMinutes: true,
  objectives: true,
  audience: true,
  prerequisites: true,
  updatedAt: true,
  categoryId: true,
  category: ITEM_REF,
  tags: { select: { tag: ITEM_REF }, orderBy: { tag: { name: 'asc' } } },
} satisfies Prisma.CourseVersionSelect;
type DraftRow = Prisma.CourseVersionGetPayload<{ select: typeof DRAFT_SELECT }>;

const COURSE_SELECT = {
  id: true,
  slug: true,
  title: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  ownerMembershipId: true,
  owner: { select: { user: { select: { displayName: true } } } },
  versions: SHOWN_VERSIONS,
} satisfies Prisma.CourseSelect;
type CourseRow = Prisma.CourseGetPayload<{ select: typeof COURSE_SELECT }>;
type ShownVersion = CourseRow['versions'][number];

function tenantOf(ctx: RequestContext) {
  if (!ctx.tenant) throw ApiException.notFound();
  return ctx.tenant.tenantId;
}

/** D-127: tenant or branch reach reads every course; assigned-only reach (Instructor) none yet. */
function readsCourses(ctx: RequestContext) {
  const scope = ctx.tenant?.branchScope ?? [];
  return scope === 'ALL' || scope.length > 0;
}

/** Creating and editing are tenant-wide only (matrix `course.create` / `course.update` T), checked live. */
async function assertTenantWide(
  tx: Tx,
  ctx: RequestContext,
  tenantId: string,
  permission: 'course.create' | 'course.update',
) {
  const reach = await liveReach(tx, ctx, tenantId, permission);
  if (reach.kind !== 'tenant') throw new ApiException(403, 'FORBIDDEN', 'Forbidden');
}

/** Display status (domain model): archived course → archived; a published version → published; else draft. */
function statusOf(row: { status: string }, shown: readonly ShownVersion[]): CourseStatus {
  if (row.status === 'archived') return 'archived';
  return shown.some((v) => v.status === 'published') ? 'published' : 'draft';
}

function publishedNumber(shown: readonly ShownVersion[]) {
  return shown.find((v) => v.status === 'published')?.versionNumber ?? null;
}

/**
 * `/`, punctuation and accents out; words joined by `-`; at most 72 characters (room for a suffix). Empty when the
 * title has no Latin letters or digits (e.g. Hindi or Tamil, D-129) — the caller then adds a random suffix.
 */
export function slugify(title: string) {
  const base = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/g, '');
  return base;
}

/** Six lowercase base32 characters: 2^30 values, never a word list. */
function randomSuffix() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  return [...randomBytes(6)].map((b) => alphabet[b % 32]).join('');
}

/**
 * D-130: the title's slug, else `-2` … `-5`, else a random suffix — one bounded lookup, never a scan of every similar
 * slug (security review 3.3). A title without Latin letters gets `course-<random>`. The unique index is the backstop.
 */
async function chooseSlug(tx: Tx, tenantId: string, title: string) {
  const base = slugify(title);
  if (base) {
    const candidates = [base, ...[2, 3, 4, 5].map((n) => `${base}-${n}`)];
    const taken = new Set(
      (
        await tx.course.findMany({
          where: { tenantId, slug: { in: candidates } },
          select: { slug: true },
        })
      ).map((c) => c.slug.toLowerCase()),
    );
    const free = candidates.find((c) => !taken.has(c));
    if (free) return free;
  }
  return `${base || 'course'}-${randomSuffix()}`;
}

const field = (name: string, code: string, message: string) =>
  ApiException.validation([{ field: name, code, message }]);

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(CURSORS) private readonly cursors: Cursors,
  ) {}

  private canEdit(ctx: RequestContext) {
    return reachFor(ctx, 'course.update')?.kind === 'tenant';
  }

  private listItem(row: CourseRow): CourseAdminListItem {
    const shown = row.versions[0];
    return {
      id: row.id,
      title: row.title,
      category: shown?.category ?? null,
      level: shown?.level ?? null,
      deliveryMode: shown?.deliveryMode ?? null,
      language: (shown?.language ?? 'en') as CourseAdminListItem['language'],
      durationMinutes: shown?.durationMinutes ?? null,
      status: statusOf(row, row.versions),
      publishedVersion: publishedNumber(row.versions),
      hasUnpublishedChanges:
        row.versions.some((v) => v.status === 'draft') &&
        row.versions.some((v) => v.status === 'published'),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private draftView(d: DraftRow): CourseDraftView {
    return {
      id: d.id,
      version: d.version,
      title: d.title,
      summary: d.summary,
      description: d.description,
      category: d.category,
      tags: d.tags.map((t) => t.tag),
      level: d.level,
      deliveryMode: d.deliveryMode,
      language: d.language as CourseDraftView['language'],
      durationMinutes: d.durationMinutes,
      objectives: d.objectives,
      audience: d.audience,
      prerequisites: d.prerequisites,
      updatedAt: d.updatedAt.toISOString(),
    };
  }

  async list(ctx: RequestContext, input: ListInput): Promise<CourseAdminListPage> {
    const tenantId = tenantOf(ctx);
    const { cursor, ...query } = input;
    const key = queryKey([
      'courses',
      tenantId,
      readsCourses(ctx),
      query.search ?? '',
      query.status ?? '',
      query.categoryId ?? '',
      query.level ?? '',
      query.deliveryMode ?? '',
      query.language ?? '',
      query.sort,
      query.direction,
      query.limit,
    ]);
    const position = cursor
      ? this.cursors.decode(cursor, key, query.sort === 'updatedAt' ? 'instant' : 'string')
      : null;
    if (!readsCourses(ctx)) return { data: [], page: { limit: query.limit, nextCursor: null } };
    // Metadata filters apply to the version the row shows: the draft, else a published version. (3.6 narrows the
    // published side to the current published version once courses point at it.)
    const meta: Prisma.CourseVersionWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.level ? { level: query.level } : {}),
      ...(query.deliveryMode ? { deliveryMode: query.deliveryMode } : {}),
      ...(query.language ? { language: query.language } : {}),
    };
    const filtersMeta = Object.keys(meta).length > 0;
    const rows = await this.prisma.course.findMany({
      where: {
        AND: [
          { tenantId },
          query.status === 'archived'
            ? { status: 'archived' }
            : query.status === 'published'
              ? { status: 'active', versions: { some: { status: 'published' } } }
              : query.status === 'draft'
                ? { status: 'active', versions: { none: { status: 'published' } } }
                : {},
          query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {},
          filtersMeta
            ? {
                OR: [
                  { versions: { some: { status: 'draft', ...meta } } },
                  {
                    versions: {
                      none: { status: 'draft' },
                      some: { status: 'published', ...meta },
                    },
                  },
                ],
              }
            : {},
          position ? afterCursor(query.sort, query.direction, position.value, position.id) : {},
        ],
      },
      orderBy: [{ [query.sort]: query.direction }, { id: query.direction }],
      take: query.limit + 1,
      select: COURSE_SELECT,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      data: page.map((r) => this.listItem(r)),
      page: {
        limit: query.limit,
        nextCursor:
          rows.length > query.limit && last
            ? this.cursors.encode(
                query.sort === 'updatedAt' ? last.updatedAt.toISOString() : last.title,
                last.id,
                key,
              )
            : null,
      },
    };
  }

  async get(ctx: RequestContext, id: string): Promise<CourseAdminView> {
    const tenantId = tenantOf(ctx);
    if (!readsCourses(ctx)) throw ApiException.notFound();
    return this.view(ctx, this.prisma, tenantId, id);
  }

  private async view(
    ctx: RequestContext,
    db: Tx | PrismaService,
    tenantId: string,
    id: string,
  ): Promise<CourseAdminView> {
    const row = await db.course.findFirst({ where: { id, tenantId }, select: COURSE_SELECT });
    if (!row) throw ApiException.notFound();
    const draft = await db.courseVersion.findFirst({
      where: { tenantId, courseId: id, status: 'draft' },
      select: DRAFT_SELECT,
    });
    return {
      id: row.id,
      slug: row.slug,
      status: statusOf(row, row.versions),
      owner: { membershipId: row.ownerMembershipId, displayName: row.owner.user.displayName },
      publishedVersion: publishedNumber(row.versions),
      draft: draft ? this.draftView(draft) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      canEdit: this.canEdit(ctx) && row.status === 'active' && draft !== null,
    };
  }

  /** A category or tags the draft may use: this tenant's and active (another tenant's id is simply unknown). */
  private async assertUsable(
    tx: Tx,
    tenantId: string,
    categoryId: string | null | undefined,
    tagIds: readonly string[] | undefined,
    keep: { categoryId: string | null; tagIds: ReadonlySet<string> } = {
      categoryId: null,
      tagIds: new Set(),
    },
  ) {
    if (categoryId) {
      const category = await tx.category.findFirst({
        where: { id: categoryId, tenantId },
        select: { status: true },
      });
      if (!category) throw field('categoryId', 'not_found', 'Choose a category from the list');
      // An archived category already on the draft may stay; it cannot be newly chosen.
      if (category.status !== 'active' && categoryId !== keep.categoryId) {
        throw field('categoryId', 'archived', 'This category is archived');
      }
    }
    if (tagIds && tagIds.length > 0) {
      const tags = await tx.tag.findMany({
        where: { id: { in: [...tagIds] }, tenantId },
        select: { id: true, status: true },
      });
      if (tags.length !== new Set(tagIds).size) {
        throw field('tagIds', 'not_found', 'Choose tags from the list');
      }
      if (tags.some((t) => t.status !== 'active' && !keep.tagIds.has(t.id))) {
        throw field('tagIds', 'archived', 'An archived tag cannot be added');
      }
    }
  }

  async create(ctx: RequestContext, input: CreateInput): Promise<CourseAdminView> {
    const tenantId = tenantOf(ctx);
    try {
      return await this.createInTransaction(ctx, tenantId, input);
    } catch (err) {
      // Cannot happen while the tenant lock holds; a 409, never a 500, if it ever does.
      if (isUniqueViolation(err, 'courses_tenant_id_slug_key')) throw conflict();
      throw err;
    }
  }

  private createInTransaction(ctx: RequestContext, tenantId: string, input: CreateInput) {
    return this.prisma.$transaction(async (tx) => {
      // The tenant lock serialises slug choice and archiving categories against their use.
      await lockTenant(tx, tenantId);
      await assertTenantWide(tx, ctx, tenantId, 'course.create');
      const owner = await tx.membership.findFirst({
        where: { tenantId, userId: ctx.userId, status: 'active' },
        select: { id: true },
      });
      if (!owner) throw new ApiException(403, 'FORBIDDEN', 'Forbidden');
      await this.assertUsable(tx, tenantId, input.categoryId, undefined);
      const slug = await chooseSlug(tx, tenantId, input.title);
      const course = await tx.course.create({
        data: {
          tenantId,
          slug,
          title: input.title,
          ownerMembershipId: owner.id,
          createdById: ctx.userId,
        },
        select: { id: true },
      });
      const draft = await tx.courseVersion.create({
        data: {
          tenantId,
          courseId: course.id,
          title: input.title,
          summary: input.summary ?? null,
          categoryId: input.categoryId ?? null,
          level: input.level ?? null,
          deliveryMode: input.deliveryMode ?? null,
          language: input.language ?? 'en',
          createdById: ctx.userId,
          updatedById: ctx.userId,
        },
        select: { id: true },
      });
      await this.audit.record(tx, {
        actorUserId: ctx.userId,
        tenantId,
        action: 'course.created',
        entityType: 'course',
        entityId: course.id,
        requestId: ctx.requestId,
        after: { slug, title: input.title, draftId: draft.id },
      });
      return this.view(ctx, tx, tenantId, course.id);
    });
  }

  /** Saves the draft's basics (builder step 1), naming the version read. */
  async updateDraft(
    ctx: RequestContext,
    courseId: string,
    input: UpdateInput,
  ): Promise<CourseAdminView> {
    const tenantId = tenantOf(ctx);
    const { version, tagIds, objectives, ...scalars } = input;
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      await assertTenantWide(tx, ctx, tenantId, 'course.update');
      const course = await tx.course.findFirst({
        where: { id: courseId, tenantId },
        select: { id: true, status: true },
      });
      if (!course) throw ApiException.notFound();
      if (course.status !== 'active') {
        throw new ApiException(409, 'COURSE_ARCHIVED', 'An archived course cannot be edited');
      }
      const draft = await tx.courseVersion.findFirst({
        where: { tenantId, courseId, status: 'draft' },
        select: { ...DRAFT_SELECT, tags: { select: { tagId: true } } },
      });
      // No draft to edit: creating one from the published version comes with publishing (3.6).
      if (!draft) throw new ApiException(409, 'NO_DRAFT', 'This course has no draft to edit');
      if (draft.version !== version) throw conflict();
      const currentTags = new Set(draft.tags.map((t) => t.tagId));
      await this.assertUsable(tx, tenantId, scalars.categoryId, tagIds, {
        categoryId: draft.categoryId,
        tagIds: currentTags,
      });

      const diff = changedFields(
        {
          title: draft.title,
          summary: draft.summary,
          description: draft.description,
          categoryId: draft.categoryId,
          level: draft.level,
          deliveryMode: draft.deliveryMode,
          language: draft.language,
          durationMinutes: draft.durationMinutes,
          audience: draft.audience,
          prerequisites: draft.prerequisites,
        },
        scalars,
        // Long free text is recorded as changed, never by value.
        { personal: ['summary', 'description', 'audience', 'prerequisites'] },
      );
      const objectivesChanged =
        objectives !== undefined &&
        (objectives.length !== draft.objectives.length ||
          objectives.some((o, i) => o !== draft.objectives[i]));
      const tagsChanged =
        tagIds !== undefined &&
        (tagIds.length !== currentTags.size || tagIds.some((t) => !currentTags.has(t)));
      if (!diff.changed && !objectivesChanged && !tagsChanged) {
        return this.view(ctx, tx, tenantId, courseId);
      }

      const result = await tx.courseVersion.updateMany({
        where: { id: draft.id, tenantId, status: 'draft', version },
        data: {
          ...scalars,
          ...(objectivesChanged ? { objectives } : {}),
          updatedById: ctx.userId,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) throw conflict();
      if (tagsChanged && tagIds) {
        const next = new Set(tagIds);
        await tx.courseVersionTag.deleteMany({
          where: {
            tenantId,
            courseVersionId: draft.id,
            tagId: { in: [...currentTags].filter((t) => !next.has(t)) },
          },
        });
        const added = tagIds.filter((t) => !currentTags.has(t));
        if (added.length > 0) {
          await tx.courseVersionTag.createMany({
            data: added.map((tagId) => ({ tenantId, courseVersionId: draft.id, tagId })),
          });
        }
      }
      // The listing title follows the draft; touching the row also moves the course up "recently updated".
      await tx.course.updateMany({
        where: { id: courseId, tenantId },
        data: { title: scalars.title ?? draft.title },
      });
      await this.audit.record(tx, {
        actorUserId: ctx.userId,
        tenantId,
        action: 'course.draft_updated',
        entityType: 'course',
        entityId: courseId,
        requestId: ctx.requestId,
        before: {
          ...diff.before,
          ...(objectivesChanged ? { objectives: '[changed]' } : {}),
          ...(tagsChanged ? { tagIds: [...currentTags] } : {}),
        },
        after: {
          ...diff.after,
          ...(objectivesChanged ? { objectives: '[changed]' } : {}),
          ...(tagsChanged ? { tagIds } : {}),
        },
      });
      return this.view(ctx, tx, tenantId, courseId);
    });
  }
}
