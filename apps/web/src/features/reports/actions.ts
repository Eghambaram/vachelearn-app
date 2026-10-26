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
  return getComplianceReport(query, {
    demoState: session.demo ? parseDemoState(demoState) : 'ready',
  });
}
