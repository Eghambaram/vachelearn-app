'use server';

import { parseDemoState } from '@/lib/api/client';
import { getComplianceReport } from '@/lib/api/reports';
import { getSession } from '@/lib/api/session';

/**
 * Compliance report requests from the browser. A server action is a public endpoint: it re-validates everything
 * through `getComplianceReport`, which takes the tenant and branch scope from the session and checks permissions.
 * Phase 5 forwards to the API.
 */
export async function complianceReportAction(query: unknown, demoState: unknown) {
  const session = await getSession();
  // A real session without demo content has no reports yet (D-097): the action is a public endpoint, so it says so
  // itself rather than relying on the page (exit-gate security review).
  if (!session.demo && !session.demoContent) {
    return {
      ok: false as const,
      status: 404,
      error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'req_demo_0404' },
    };
  }
  return getComplianceReport(query, {
    demoState: session.demo ? parseDemoState(demoState) : 'ready',
  });
}
