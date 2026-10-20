import {
  PlatformDashboard,
  PlatformDashboardQuery,
  type PlatformDashboard as PlatformDashboardData,
} from '@vachelearn/contracts';
import { buildPlatformDashboard } from '@/mocks/platform-dashboard';
import { demoError, type ApiResult, type DemoState } from './client';

/**
 * GET /api/v1/platform/dashboard. Phase 1: served from the demo fixture; Phase 2.2/6.4: an HTTP call with the same
 * signature. The response is parsed with the shared contract either way, so a fixture cannot drift from the API shape.
 */
export async function getPlatformDashboard(
  query: unknown,
  { demoState = 'ready', now = new Date() }: { demoState?: DemoState; now?: Date } = {},
): Promise<ApiResult<PlatformDashboardData>> {
  const parsed = PlatformDashboardQuery.safeParse(query);
  if (!parsed.success) {
    return {
      ok: false,
      status: 422,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid query',
        requestId: 'req_demo_0422',
        fieldErrors: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        })),
      },
    };
  }
  if (demoState === 'forbidden') return demoError(403);
  if (demoState === 'error') return demoError(500);
  const body = buildPlatformDashboard(parsed.data.period, now, { empty: demoState === 'empty' });
  return { ok: true, data: PlatformDashboard.parse(body) };
}
