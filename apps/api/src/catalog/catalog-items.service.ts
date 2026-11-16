import { Inject, Injectable } from '@nestjs/common';
import type { CatalogItemListQuery, CategoryView } from '@vachelearn/contracts';
import type { z } from 'zod';
import type { Category, Prisma } from '../../generated/prisma/client';
import { liveReach, reachFor, readsCourses } from '../access/reach';
import type { RequestContext } from '../access/request-context';
import { lockTenant } from '../access/tenant-admins';
import { AuditService, type Tx } from '../audit/audit.service';
import { ApiException } from '../common/errors/api-exception';
import { CURSORS, Cursors, afterCursor, queryKey } from '../common/pagination/keyset';
import { isUniqueViolation } from '../prisma/errors';
import { PrismaService } from '../prisma/prisma.service';
import { conflict } from '../tenancy/tenants.service';

/*
 * The tenant's course categories and tags (Slice 3.3, D-128): flat lists, read by every `course.read` holder (they
 * filter the course list and fill the editor's pickers), changed only by `catalog.manage` (Tenant Admin). Names are
 * unique within the tenant ignoring case. Never deleted (trigger): an archived category or tag leaves the pickers and
 * stays on the versions that use it. Every change is audited. Categories and tags have the same shape, so one service
 * serves both, named by `kind`.
 */

export type CatalogKind = 'category' | 'tag';
type ListInput = z.output<typeof CatalogItemListQuery>;
/** Category and Tag rows are identical in shape (see schema). */
type ItemRow = Category;

/**
 * The Prisma delegate for a kind. `tag` has exactly the `category` delegate's shape (same columns and indexes), so it
 * is typed as one: Prisma's two delegate types are not assignable to each other's generics, but every call made here
 * is valid on both.
 */
function delegate(db: Tx | PrismaService, kind: CatalogKind): Prisma.CategoryDelegate {
  return kind === 'category' ? db.category : (db.tag as unknown as Prisma.CategoryDelegate); // identical shape, see above
}

const LABEL = { category: 'category', tag: 'tag' } as const;
const UNIQUE = {
  category: 'categories_tenant_id_name_key',
  tag: 'tags_tenant_id_name_key',
} as const;

/** `withReason`: the archive reason (free text) only for catalog managers (reviews 3.3, like D-106). */
export function toCatalogItemView(r: ItemRow, withReason = true): CategoryView {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    archivedAt: r.archivedAt?.toISOString() ?? null,
    archivedReason: withReason ? r.archivedReason : null,
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function tenantOf(ctx: RequestContext) {
  if (!ctx.tenant) throw ApiException.notFound();
  return ctx.tenant.tenantId;
}

/** Changes re-check the caller's live tenant-wide `catalog.manage` inside the transaction (reviews 3.3). */
async function assertManager(tx: Tx, ctx: RequestContext, tenantId: string) {
  const reach = await liveReach(tx, ctx, tenantId, 'catalog.manage');
  if (reach.kind !== 'tenant') throw new ApiException(403, 'FORBIDDEN', 'Forbidden');
}

const nameTaken = (kind: CatalogKind) =>
  ApiException.validation([
    {
      field: 'name',
      code: 'taken',
      message: `This organisation already has a ${LABEL[kind]} with this name`,
    },
  ]);

@Injectable()
export class CatalogItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(CURSORS) private readonly cursors: Cursors,
  ) {}

  async list(ctx: RequestContext, kind: CatalogKind, input: ListInput) {
    const tenantId = tenantOf(ctx);
    const { cursor, ...query } = input;
    const key = queryKey([kind, tenantId, query.status ?? '', query.search ?? '', query.limit]);
    const position = cursor ? this.cursors.decode(cursor, key, 'string') : null;
    if (!readsCourses(ctx)) return { data: [], page: { limit: query.limit, nextCursor: null } };
    const withReason = reachFor(ctx, 'catalog.manage')?.kind === 'tenant';
    const rows = await delegate(this.prisma, kind).findMany({
      where: {
        AND: [
          { tenantId },
          query.status ? { status: query.status } : {},
          query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {},
          position ? afterCursor('name', 'asc', position.value, position.id) : {},
        ],
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      data: page.map((r) => toCatalogItemView(r, withReason)),
      page: {
        limit: query.limit,
        nextCursor:
          rows.length > query.limit && last ? this.cursors.encode(last.name, last.id, key) : null,
      },
    };
  }

  async create(ctx: RequestContext, kind: CatalogKind, name: string) {
    const tenantId = tenantOf(ctx);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await lockTenant(tx, tenantId);
        await assertManager(tx, ctx, tenantId);
        const row = await delegate(tx, kind).create({
          data: { tenantId, name, createdById: ctx.userId },
        });
        await this.audit.record(tx, {
          actorUserId: ctx.userId,
          tenantId,
          action: `${kind}.created`,
          entityType: kind,
          entityId: row.id,
          requestId: ctx.requestId,
          after: { name: row.name },
        });
        return row;
      });
      return toCatalogItemView(created);
    } catch (err) {
      if (isUniqueViolation(err, UNIQUE[kind])) throw nameTaken(kind);
      throw err;
    }
  }

  async rename(
    ctx: RequestContext,
    kind: CatalogKind,
    id: string,
    input: { version: number; name: string },
  ) {
    const tenantId = tenantOf(ctx);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        await lockTenant(tx, tenantId);
        await assertManager(tx, ctx, tenantId);
        const items = delegate(tx, kind);
        const current = await items.findFirst({ where: { id, tenantId } });
        if (!current) throw ApiException.notFound();
        if (current.version !== input.version) throw conflict();
        if (current.name === input.name) return current;
        const result = await items.updateMany({
          where: { id, tenantId, version: input.version },
          data: { name: input.name, version: { increment: 1 } },
        });
        if (result.count === 0) throw conflict();
        await this.audit.record(tx, {
          actorUserId: ctx.userId,
          tenantId,
          action: `${kind}.renamed`,
          entityType: kind,
          entityId: id,
          requestId: ctx.requestId,
          before: { name: current.name },
          after: { name: input.name },
        });
        return items.findFirstOrThrow({ where: { id, tenantId } });
      });
      return toCatalogItemView(updated);
    } catch (err) {
      if (isUniqueViolation(err, UNIQUE[kind])) throw nameTaken(kind);
      throw err;
    }
  }

  async setArchived(
    ctx: RequestContext,
    kind: CatalogKind,
    id: string,
    archived: boolean,
    reason: string,
  ) {
    const tenantId = tenantOf(ctx);
    const updated = await this.prisma.$transaction(async (tx) => {
      // Same lock as draft saves: an item being archived is never newly attached at the same moment.
      await lockTenant(tx, tenantId);
      await assertManager(tx, ctx, tenantId);
      const items = delegate(tx, kind);
      const current = await items.findFirst({ where: { id, tenantId } });
      if (!current) throw ApiException.notFound();
      const result = await items.updateMany({
        where: { id, tenantId, status: archived ? 'active' : 'archived' },
        data: archived
          ? {
              status: 'archived',
              archivedAt: new Date(),
              archivedReason: reason,
              archivedById: ctx.userId,
              version: { increment: 1 },
            }
          : {
              status: 'active',
              archivedAt: null,
              archivedReason: null,
              archivedById: null,
              version: { increment: 1 },
            },
      });
      if (result.count === 0) {
        throw new ApiException(
          409,
          'INVALID_STATE',
          `The ${LABEL[kind]} is already ${current.status}`,
        );
      }
      await this.audit.record(tx, {
        actorUserId: ctx.userId,
        tenantId,
        action: archived ? `${kind}.archived` : `${kind}.reactivated`,
        entityType: kind,
        entityId: id,
        requestId: ctx.requestId,
        reason,
        before: { status: current.status },
        after: { status: archived ? 'archived' : 'active' },
      });
      return items.findFirstOrThrow({ where: { id, tenantId } });
    });
    return toCatalogItemView(updated);
  }
}
