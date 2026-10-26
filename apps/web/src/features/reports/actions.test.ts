import type { RoleKey } from '@/lib/api/session-types';
import { buildDemoSession, demoBranchId } from '@/mocks/demo-session';

let current = buildDemoSession('tenant_admin', 'demo-tenant-1');
vi.mock('@/lib/api/session', () => ({ getSession: async () => current }));

const { complianceReportAction } = await import('./actions');

const as = (role: RoleKey) => (current = buildDemoSession(role, 'demo-tenant-1'));

/** The server action is a public endpoint: everything the browser sends is re-validated against the session. */
describe('complianceReportAction', () => {
  it('a client cannot name a tenant', async () => {
    as('tenant_admin');
    expect(await complianceReportAction({ tenantId: 'demo-tenant-2' }, 'ready')).toMatchObject({
      status: 422,
    });
  });

  it('branch admin of A1 cannot widen to A2 through the action', async () => {
    as('branch_admin');
    expect(
      await complianceReportAction({ branchId: demoBranchId('demo-tenant-1', 'a2') }, 'ready'),
    ).toMatchObject({ status: 422 });
  });

  it('an unknown demo state is ignored, and roles without the permissions are refused', async () => {
    as('tenant_admin');
    expect(await complianceReportAction({}, 'not-a-state')).toMatchObject({ ok: true });
    as('instructor');
    expect(await complianceReportAction({}, 'ready')).toMatchObject({ status: 403 });
  });
});
