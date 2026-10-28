import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrismaClient } from '../generated/prisma/client';
import { PLATFORM_PERMISSIONS, TENANT_PERMISSIONS } from '../src/access/permissions';
import { resetDatabase, testPrisma } from './db';

/** Database-level guarantees: they hold even if a service has a bug (.claude/rules/database.md). */
let db: PrismaClient;
let tenantA: string;
let tenantB: string;
let branchB: string;

beforeAll(() => {
  db = testPrisma();
});
beforeEach(async () => {
  await resetDatabase(db);
  tenantA = (
    await db.tenant.create({ data: { slug: 'tenant-a', displayName: 'A', defaultTimezone: 'UTC' } })
  ).id;
  tenantB = (
    await db.tenant.create({ data: { slug: 'tenant-b', displayName: 'B', defaultTimezone: 'UTC' } })
  ).id;
  branchB = (
    await db.branch.create({ data: { tenantId: tenantB, code: 'B1', name: 'B1', timezone: 'UTC' } })
  ).id;
});
afterAll(async () => {
  await db.$disconnect();
});

const event = (tenantId: string | null, branchId: string | null) => ({
  tenantId,
  branchId,
  action: 'test.recorded',
  entityType: 'test',
  entityId: tenantB,
  requestId: 'req_test',
});

describe('composite tenant keys', () => {
  it('rejects an audit event whose branch belongs to another tenant (composite FK)', async () => {
    await expect(db.auditEvent.create({ data: event(tenantA, branchB) })).rejects.toThrow();
    await expect(db.auditEvent.create({ data: event(tenantB, branchB) })).resolves.toBeTruthy();
  });

  it('rejects a branch reference without a tenant (a NULL would skip the composite FK)', async () => {
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO audit_events (action, entity_type, entity_id, branch_id) VALUES ('x.y', 't', '${tenantB}', '${branchB}')`,
      ),
    ).rejects.toThrow(/audit_events_branch_needs_tenant/);
  });
});

describe('audit events are insert-only', () => {
  it('UPDATE and DELETE are rejected by the trigger', async () => {
    const row = await db.auditEvent.create({ data: event(tenantB, null) });
    await expect(
      db.auditEvent.update({ where: { id: row.id }, data: { action: 'tampered' } }),
    ).rejects.toThrow(/insert-only/);
    await expect(db.auditEvent.delete({ where: { id: row.id } })).rejects.toThrow(/insert-only/);
    expect((await db.auditEvent.findUniqueOrThrow({ where: { id: row.id } })).action).toBe(
      'test.recorded',
    );
  });
});

describe('check constraints', () => {
  it('tenant slug format, branch code format and lifecycle bookkeeping are enforced by the database', async () => {
    await expect(
      db.tenant.create({ data: { slug: 'Bad Slug', displayName: 'X', defaultTimezone: 'UTC' } }),
    ).rejects.toThrow(/tenants_slug_format/);
    await expect(
      db.branch.create({ data: { tenantId: tenantA, code: 'lower', name: 'X', timezone: 'UTC' } }),
    ).rejects.toThrow(/branches_code_format/);
    await expect(
      db.tenant.update({ where: { id: tenantA }, data: { status: 'suspended' } }),
    ).rejects.toThrow(/tenants_suspension_recorded/);
    await expect(
      db.branch.update({ where: { id: branchB }, data: { status: 'inactive' } }),
    ).rejects.toThrow(/branches_deactivation_recorded/);
  });

  it('ids are UUID v7 from the database (time-ordered)', async () => {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantA } });
    expect(tenant.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe('permission registry', () => {
  it('every enforced permission key appears in docs/ROLE_PERMISSION_MATRIX.md', () => {
    const matrix = readFileSync(
      resolve(__dirname, '../../../docs/ROLE_PERMISSION_MATRIX.md'),
      'utf8',
    );
    const missing = [...PLATFORM_PERMISSIONS, ...TENANT_PERMISSIONS].filter(
      (key) => !matrix.includes(`\`${key}\``),
    );
    expect(missing).toEqual([]);
  });
});
