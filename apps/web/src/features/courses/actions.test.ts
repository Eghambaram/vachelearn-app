import type { SessionView } from '@/lib/api/session-types';
import { buildDemoSession } from '@/mocks/demo-session';

let current: SessionView = buildDemoSession('tenant_admin', 'demo-tenant-1');
vi.mock('@/lib/api/session', () => ({ getSession: async () => current }));

const { listCoursesAction } = await import('./actions');

/** The server action is a public endpoint: it answers for itself, whatever page the browser came from. */
describe('listCoursesAction', () => {
  it('a demo session lists the sample courses', async () => {
    current = buildDemoSession('tenant_admin', 'demo-tenant-1');
    expect(await listCoursesAction({}, 'ready')).toMatchObject({ ok: true });
  });

  it('a real session without demo content gets 404, not sample courses (D-097)', async () => {
    current = {
      ...buildDemoSession('tenant_admin', 'demo-tenant-1'),
      demo: false,
      demoContent: false,
    };
    expect(await listCoursesAction({}, 'ready')).toMatchObject({ ok: false, status: 404 });
  });
});
