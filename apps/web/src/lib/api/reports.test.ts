import type { ComplianceReport } from '@vachelearn/contracts';
import type { RoleKey } from './session-types';
import { buildDemoSession, demoBranchId } from '@/mocks/demo-session';

let current = buildDemoSession('tenant_admin', 'demo-tenant-1');
vi.mock('./session', () => ({ getSession: async () => current }));

const { getComplianceReport, getComplianceReportOptions } = await import('./reports');

// Fixed clock: 26 Oct 2026, 11:00 IST.
const NOW = new Date('2026-10-26T05:30:00.000Z');
const A1 = demoBranchId('demo-tenant-1', 'a1');
const A2 = demoBranchId('demo-tenant-1', 'a2');

function as(role: RoleKey, tenantId = 'demo-tenant-1') {
  current = buildDemoSession(role, tenantId);
}

async function report(query: object = {}) {
  const result = await getComplianceReport(query, { now: NOW });
  if (!result.ok) throw new Error(`expected data, got ${result.status}`);
  return result.data;
}

/** Every row across all pages, following the server's cursors. */
async function allRows(query: object = {}) {
  const rows: ComplianceReport['data'] = [];
  let cursor: string | undefined;
  do {
    const page = await report({ ...query, limit: 100, cursor });
    rows.push(...page.data);
    cursor = page.page.nextCursor ?? undefined;
  } while (cursor);
  return rows;
}

describe('compliance report: tenant scope', () => {
  it('a tenant admin sees every learner × requirement, and the totals reconcile with the rows', async () => {
    as('tenant_admin');
    const data = await report();
    const rows = await allRows();
    expect(rows).toHaveLength(120);
    expect(data.totals.total).toBe(120);
    expect(Object.values(data.totals.byStatus).reduce((a, b) => a + b, 0)).toBe(120);
    for (const status of Object.keys(
      data.totals.byStatus,
    ) as (keyof typeof data.totals.byStatus)[]) {
      expect(rows.filter((r) => r.status === status)).toHaveLength(data.totals.byStatus[status]);
      // The demo shows every status.
      expect(data.totals.byStatus[status]).toBeGreaterThan(0);
    }
    expect(new Set(rows.map((r) => r.id)).size).toBe(120);
    expect(data.scope).toEqual({ tenantName: 'Example Manufacturing (Demo)', branches: null });
  });

  it('defaults to severity order: overdue first, not applicable last', async () => {
    as('tenant_admin');
    const rows = await allRows();
    expect(rows[0]!.status).toBe('overdue');
    expect(rows.at(-1)!.status).toBe('not_applicable');
  });

  it('a status filter picks rows but keeps the full breakdown', async () => {
    as('tenant_admin');
    const all = await report();
    const overdue = await report({ status: 'overdue' });
    expect(overdue.totals.byStatus).toEqual(all.totals.byStatus);
    expect(overdue.totals.total).toBe(all.totals.byStatus.overdue);
    expect((await allRows({ status: 'overdue' })).every((r) => r.status === 'overdue')).toBe(true);
    expect(overdue.applied.status).toBe('overdue');
  });

  it('another tenant shows that tenant’s learners only', async () => {
    as('tenant_admin', 'demo-tenant-2');
    expect((await allRows()).every((r) => r.id.startsWith('demo-tenant-2-'))).toBe(true);
  });
});

describe('compliance report: branch scope (D-026)', () => {
  it('a branch admin of A1 sees learners with any branch in A1, including multi-branch learners', async () => {
    as('branch_admin');
    const rows = await allRows();
    const learners = new Set(rows.map((r) => r.learnerName));
    expect(learners.size).toBeGreaterThan(0);
    expect(rows.every((r) => r.branches.length > 0 && r.branches.every((b) => b.id === A1))).toBe(
      true,
    );
    // Branch-scoped viewers never see primary markers, so a missing one cannot reveal an out-of-scope primary branch.
    expect(rows.every((r) => r.branches.every((b) => !b.primary))).toBe(true);
    const data = await report();
    expect(data.scope.branches).toEqual([{ id: A1, name: 'Example Branch A1' }]);
  });

  it('branch admin of A1 cannot see A2 via branchId: the same 422 as an unknown or another tenant’s branch', async () => {
    as('branch_admin');
    const outOfScope = await getComplianceReport({ branchId: A2 }, { now: NOW });
    const unknown = await getComplianceReport({ branchId: 'nope' }, { now: NOW });
    const otherTenant = await getComplianceReport(
      { branchId: demoBranchId('demo-tenant-2', 'a1') },
      { now: NOW },
    );
    expect(outOfScope).toMatchObject({ ok: false, status: 422 });
    expect(unknown).toEqual(outOfScope);
    expect(otherTenant).toEqual(outOfScope);
  });

  it('a cursor from a tenant-wide view is refused in a branch-scoped view, and with other filters', async () => {
    as('tenant_admin');
    const cursor = (await report({ limit: 10 })).page.nextCursor!;
    as('branch_admin');
    expect(await getComplianceReport({ limit: 10, cursor }, { now: NOW })).toMatchObject({
      status: 422,
      error: { code: 'INVALID_CURSOR' },
    });
    as('tenant_admin');
    expect(
      await getComplianceReport({ limit: 10, cursor, status: 'overdue' }, { now: NOW }),
    ).toMatchObject({ status: 422 });
  });

  it('filter options list only branches in scope', async () => {
    as('branch_admin');
    expect(await getComplianceReportOptions()).toMatchObject({
      ok: true,
      data: { branches: [{ id: A1 }] },
    });
  });
});

describe('compliance report: D-026 details', () => {
  it('tenant-wide viewers see primary markers and multi-branch learners in every branch', async () => {
    as('tenant_admin');
    const rows = await allRows();
    const multi = rows.filter((r) => r.branches.length === 2);
    expect(multi.length).toBeGreaterThan(0);
    expect(multi.every((r) => r.branches.filter((b) => b.primary).length === 1)).toBe(true);
    // A multi-branch learner is counted in each of their branches when filtering by branch.
    const learner = multi[0]!;
    for (const b of learner.branches) {
      expect((await allRows({ branchId: b.id })).some((r) => r.id === learner.id)).toBe(true);
    }
  });

  it('options and the course filter cover only requirements that reach the viewer’s scope', async () => {
    as('tenant_admin');
    const all = await getComplianceReportOptions();
    expect(all.ok && all.data.courses.map((c) => c.name)).toContain('Lockout / Tagout (Demo)');
    // A viewer scoped to the head office only: Lockout / Tagout applies to Branch A1 alone.
    current = {
      ...buildDemoSession('branch_admin', 'demo-tenant-1'),
      branchScope: [{ id: demoBranchId('demo-tenant-1', 'hq'), name: 'Example Head Office' }],
    };
    const hq = await getComplianceReportOptions();
    expect(hq.ok && hq.data.courses.map((c) => c.name)).not.toContain('Lockout / Tagout (Demo)');
    expect(
      await getComplianceReport({ courseId: 'demo-tenant-1-req-loto' }, { now: NOW }),
    ).toMatchObject({ status: 422 });
  });
});

describe('compliance report: permissions and validation', () => {
  it('an unauthorised role gets 403 even with an invalid query (deny by default)', async () => {
    as('learner');
    expect(
      await getComplianceReport({ sort: 'x', tenantId: 'demo-tenant-2' }, { now: NOW }),
    ).toMatchObject({ status: 403 });
  });

  it('a cursor is refused with another course or branch filter', async () => {
    as('tenant_admin');
    const cursor = (await report({ limit: 10 })).page.nextCursor!;
    for (const filter of [{ courseId: 'demo-tenant-1-req-fire' }, { branchId: A1 }]) {
      expect(
        await getComplianceReport({ limit: 10, cursor, ...filter }, { now: NOW }),
      ).toMatchObject({ status: 422, error: { code: 'INVALID_CURSOR' } });
    }
  });

  it('roles without report.read + compliance.read are refused', async () => {
    for (const role of ['instructor', 'learner'] as const) {
      as(role);
      expect(await getComplianceReport({}, { now: NOW })).toMatchObject({ status: 403 });
    }
  });

  it('a client cannot name the tenant, and unknown courses or sort fields are 422', async () => {
    as('tenant_admin');
    for (const query of [{ tenantId: 'demo-tenant-2' }, { courseId: 'nope' }, { sort: 'name' }]) {
      expect(await getComplianceReport(query, { now: NOW })).toMatchObject({ status: 422 });
    }
  });

  it('pages never overlap and follow a stable order when sorted by due date', async () => {
    as('tenant_admin');
    const rows = await allRows({ sort: 'dueOn' });
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    const due = rows.map((r) => r.dueOn).filter((d): d is string => d !== null);
    expect(due).toEqual([...due].sort());
  });
});
