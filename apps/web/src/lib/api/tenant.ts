import {
  TenantDashboard,
  TenantDashboardQuery,
  type TenantDashboard as TenantDashboardData,
} from '@vachelearn/contracts';
import { buildTenantDashboard } from '@/mocks/tenant-dashboard';
import { demoError, validationError, type ApiResult, type DemoState } from './client';
import { getSession } from './session';

/**
 * GET /api/v1/dashboard (tenant workspace). Tenant and branch scope come from the session — this function takes no
 * tenant or branch argument, mirroring the API, which derives both from the authenticated membership (D-026).
 * Phase 1: demo fixture parsed with the shared contract; later: an HTTP call with the same signature.
 */
export async function getTenantDashboard(
  query: unknown,
  { demoState = 'ready', now = new Date() }: { demoState?: DemoState; now?: Date } = {},
): Promise<ApiResult<TenantDashboardData>> {
  const parsed = TenantDashboardQuery.safeParse(query);
  if (!parsed.success) return validationError(parsed.error);
  const session = await getSession();
  if (
    demoState === 'forbidden' ||
    !session.activeTenantId ||
    !session.permissions.includes('report.read')
  ) {
    return demoError(403);
  }
  if (demoState === 'error') return demoError(500);
  const body = buildTenantDashboard(parsed.data.period, now, {
    tenantId: session.activeTenantId,
    branchScope: session.branchScope,
    empty: demoState === 'empty',
  });
  return { ok: true, data: TenantDashboard.parse(body) };
}
