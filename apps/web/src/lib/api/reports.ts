import {
  COMPLIANCE_SEVERITY,
  ComplianceReport,
  ComplianceReportOptions,
  ComplianceReportQuery,
  ComplianceStatus,
  type ComplianceReport as ComplianceReportData,
  type ComplianceReportOptions as ComplianceReportOptionsData,
} from '@vachelearn/contracts';
import {
  demoComplianceRecords,
  demoRequirementCourses,
  type DemoComplianceRecord,
} from '@/mocks/compliance';
import { DEMO_BRANCHES, DEMO_TENANTS, demoBranchId } from '@/mocks/demo-session';
import { DEMO_TENANT_ZONE } from '@/mocks/tenant-dashboard';
import { demoError, validationError, type ApiResult, type DemoState } from './client';
import { cursorOffset, encodeCursor, invalidCursor, queryKey } from './cursor';
import { getSession } from './session';

/*
 * GET /api/v1/reports/compliance and …/compliance/options (`report.read` + `compliance.read`). Server-only. The tenant
 * and the branch scope come from the session; every filter is checked against that scope, so no parameter, cursor or
 * id can widen what the viewer sees. A branch the viewer may not use — another tenant's, out of scope, or unknown —
 * gets one and the same 422, so the response never says which branches exist. Phase 1 serves the demo fixture with
 * the API's list semantics; Phase 5 serves the same shapes from the compliance module.
 */

async function reportScope() {
  const session = await getSession();
  const tenantId = session.activeTenantId;
  if (
    !tenantId ||
    !session.permissions.includes('report.read') ||
    !session.permissions.includes('compliance.read')
  ) {
    return null;
  }
  const tenantBranches = DEMO_BRANCHES.map((b) => ({
    id: demoBranchId(tenantId, b.key),
    name: b.name,
  }));
  // null scope = the whole tenant; otherwise only these branches (Branch Admin, branch-scoped roles).
  const scoped = session.branchScope;
  const visibleBranches = scoped
    ? tenantBranches.filter((b) => scoped.some((s) => s.id === b.id))
    : tenantBranches;
  return {
    tenantId,
    tenantName: DEMO_TENANTS.find((t) => t.tenantId === tenantId)?.tenantName ?? '',
    scope: scoped ? visibleBranches : null,
    visibleBranches,
  };
}

/** Requirements whose audience overlaps the viewer's scope (tenant-wide ones always do). */
function requirementsInScope(scope: { tenantId: string; visibleBranches: { id: string }[] }) {
  const visible = new Set(scope.visibleBranches.map((b) => b.id));
  return demoRequirementCourses(scope.tenantId).filter(
    (c) => c.audienceBranchIds === null || c.audienceBranchIds.some((id) => visible.has(id)),
  );
}

/** D-026: a learner is in scope when any of their branches is. */
function inScope(record: DemoComplianceRecord, branchIds: ReadonlySet<string>) {
  return record.learner.branchIds.some((id) => branchIds.has(id));
}

function fieldError(field: string, message: string): ApiResult<never> {
  return {
    ok: false,
    status: 422,
    error: {
      code: 'VALIDATION_FAILED',
      message: 'Invalid request',
      requestId: 'req_demo_0422',
      fieldErrors: [{ field, code: 'invalid', message }],
    },
  };
}

export async function getComplianceReportOptions(): Promise<
  ApiResult<ComplianceReportOptionsData>
> {
  const scope = await reportScope();
  if (!scope) return demoError(403);
  return {
    ok: true,
    data: ComplianceReportOptions.parse({
      branches: scope.visibleBranches,
      courses: requirementsInScope(scope).map(({ id, name }) => ({ id, name })),
    }),
  };
}

export async function getComplianceReport(
  input: unknown,
  { demoState = 'ready', now = new Date() }: { demoState?: DemoState; now?: Date } = {},
): Promise<ApiResult<ComplianceReportData>> {
  // Deny by default: permission and scope first, so an unauthorised caller gets 403 whatever it sends.
  const scope = await reportScope();
  if (demoState === 'forbidden' || !scope) return demoError(403);
  const parsed = ComplianceReportQuery.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  if (demoState === 'error') return demoError(500);

  const { cursor, ...query } = parsed.data;
  const branch = query.branchId ? scope.visibleBranches.find((b) => b.id === query.branchId) : null;
  if (query.branchId && !branch) return fieldError('branchId', 'Not a branch you can report on');
  const course = query.courseId
    ? requirementsInScope(scope).find((c) => c.id === query.courseId)
    : null;
  if (query.courseId && !course) return fieldError('courseId', 'Not a course with a requirement');

  // The key includes the tenant and the scope, so a cursor never carries over to another tenant, role or scope.
  const key = queryKey([
    scope.tenantId,
    scope.visibleBranches.map((b) => b.id),
    query.branchId ?? '',
    query.courseId ?? '',
    query.status ?? '',
    query.sort,
    query.direction,
    query.limit,
  ]);
  let offset = 0;
  if (cursor) {
    const at = cursorOffset(cursor, key);
    if (at === null) return invalidCursor();
    offset = at;
  }

  const branchIds = new Set(branch ? [branch.id] : scope.visibleBranches.map((b) => b.id));
  const matching = (demoState === 'empty' ? [] : demoComplianceRecords(scope.tenantId, now)).filter(
    (r) => inScope(r, branchIds) && (!course || r.courseId === course.id),
  );
  // Totals by status cover the scope + branch + course filters; the status filter then picks rows.
  const byStatus = Object.fromEntries(
    ComplianceStatus.options.map((s) => [s, matching.filter((r) => r.status === s).length]),
  ) as Record<ComplianceStatus, number>;
  const rows = matching
    .filter((r) => !query.status || r.status === query.status)
    .sort((a, b) => {
      const primary =
        query.sort === 'status'
          ? COMPLIANCE_SEVERITY.indexOf(a.status) - COMPLIANCE_SEVERITY.indexOf(b.status)
          : query.sort === 'dueOn'
            ? (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999')
            : a.learner.name.localeCompare(b.learner.name, 'en');
      // Stable order: then learner and row id, so pages never overlap or skip.
      return (
        (query.direction === 'asc' ? primary : -primary) ||
        a.learner.name.localeCompare(b.learner.name, 'en') ||
        a.id.localeCompare(b.id)
      );
    });

  const visible = new Set(scope.visibleBranches.map((b) => b.id));
  const page = rows.slice(offset, offset + query.limit);
  const next = offset + query.limit;
  return {
    ok: true,
    data: ComplianceReport.parse({
      data: page.map((r) => ({
        id: r.id,
        learnerName: r.learner.name,
        // Only branches the viewer can see (D-026); never names of branches outside their scope.
        branches: r.learner.branchIds
          .filter((id) => visible.has(id))
          .map((id) => ({
            id,
            name: scope.visibleBranches.find((b) => b.id === id)!.name,
            // Only tenant-wide viewers see which branch is primary: for a branch-scoped viewer a missing marker
            // would reveal that the primary branch lies outside their scope (isolation review, 1.5.8).
            primary: scope.scope === null && id === r.learner.branchIds[0],
          })),
        courseId: r.courseId,
        courseTitle: r.courseTitle,
        status: r.status,
        dueOn: r.dueOn,
        completedOn: r.completedOn,
        validThrough: r.validThrough,
        progressPercent: r.progressPercent,
      })),
      page: { nextCursor: next < rows.length ? encodeCursor(next, key) : null, limit: query.limit },
      generatedAt: now.toISOString(),
      timeZone: DEMO_TENANT_ZONE,
      scope: { tenantName: scope.tenantName, branches: scope.scope },
      applied: {
        branch: branch ?? null,
        course: course ? { id: course.id, name: course.name } : null,
        status: query.status ?? null,
      },
      totals: {
        total: query.status ? byStatus[query.status] : matching.length,
        byStatus,
      },
    }),
  };
}
