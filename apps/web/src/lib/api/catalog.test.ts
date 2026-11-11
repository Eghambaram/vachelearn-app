import type { SessionView } from './session-types';
import { buildDemoSession } from '@/mocks/demo-session';
import { catalogCourses } from '@/mocks/catalog';

/*
 * Demo catalog and public tenant sites (D-110, D-111). The session decides the tenant and what the user may do; a real
 * session is mapped onto the sample data only while demo content is on.
 */

let current: SessionView = buildDemoSession('learner', 'demo-tenant-1');
vi.mock('./session', () => ({ getSession: async () => current }));

const { getCatalog, getCatalogCourse, getPublicSite, getPublicCourse } = await import('./catalog');
const { getContentSession } = await import('./content-session');
const { addDemoEnrolment, parseDemoEnrolments } = await import('./demo-enrolments');

const NOW = new Date('2026-11-11T06:30:00.000Z');

function realSession(role: SessionView['role'], slug: string, demoContent: boolean): SessionView {
  return {
    ...buildDemoSession(role, 'demo-tenant-1'),
    user: {
      id: '0190f0aa-0000-7000-8000-000000000001',
      displayName: 'Real (Demo)',
      email: 'r@x.test',
    },
    memberships: [{ tenantId: 'real-tenant', tenantName: 'Demo Logistics Ltd' }],
    activeTenantId: 'real-tenant',
    activeTenantSlug: slug,
    demo: false,
    demoContent,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  current = buildDemoSession('learner', 'demo-tenant-1');
});

describe('content session (D-110)', () => {
  it('leaves a real session untouched while demo content is off', async () => {
    current = realSession('learner', 'demo-logistics', false);
    expect(await getContentSession()).toBe(current);
  });

  it('maps a real session onto the demo tenant for its slug and the demo learner, keeping role and permissions', async () => {
    current = realSession('learner', 'demo-logistics', true);
    const mapped = await getContentSession();
    expect(mapped.activeTenantId).toBe('demo-tenant-2');
    expect(mapped.user.id).toBe('demo-user');
    expect(mapped.user.displayName).toBe('Real (Demo)');
    expect(mapped.role).toBe('learner');
    expect(mapped.permissions).toBe(current.permissions);
  });
});

describe('learner catalog', () => {
  it('does not exist for a real session while demo content is off (D-097), so enrolling fails', async () => {
    current = realSession('learner', 'demo-manufacturing', false);
    const catalog = await getCatalog(NOW);
    expect(catalog.ok ? 200 : catalog.status).toBe(404);
    const course = await getCatalogCourse('real-tenant-course-001', NOW);
    expect(course.ok ? 200 : course.status).toBe(404);
  });

  it('lists published courses once per topic, with figures that match the outline', () => {
    const courses = catalogCourses('demo-tenant-1', NOW);
    expect(courses.length).toBeGreaterThan(5);
    for (const course of courses) {
      expect(course.status).toBe('published');
      expect(course.title).not.toMatch(/ II \(Demo\)$/);
      const lessons = course.modules.flatMap((m) => m.lessons);
      expect(course.moduleCount).toBe(course.modules.length);
      expect(course.lessonCount).toBe(lessons.length);
      expect(course.durationMinutes).toBe(lessons.reduce((sum, l) => sum + l.durationMinutes, 0));
    }
  });

  it('marks courses the learner already holds and lets only learners enrol themselves', async () => {
    const catalog = await getCatalog(NOW);
    if (!catalog.ok) throw new Error('expected a catalog');
    expect(catalog.data.canSelfEnrol).toBe(true);
    expect(catalog.data.courses.some((c) => c.enrollment !== null)).toBe(true);

    current = {
      ...buildDemoSession('tenant_admin', 'demo-tenant-1'),
      permissions: ['catalog.browse'],
    };
    const admin = await getCatalog(NOW);
    if (!admin.ok) throw new Error('expected a catalog');
    expect(admin.data.canSelfEnrol).toBe(false);
  });

  it('refuses roles without catalog.browse, and 404s a course from another tenant', async () => {
    current = buildDemoSession('compliance_viewer', 'demo-tenant-1');
    expect((await getCatalog(NOW)).ok).toBe(false);

    current = buildDemoSession('learner', 'demo-tenant-1');
    const other = catalogCourses('demo-tenant-2', NOW)[0]!;
    const result = await getCatalogCourse(other.id, NOW);
    expect(result.ok ? 200 : result.status).toBe(404);
  });
});

describe('demo enrolments cookie', () => {
  it('keeps only well-formed, unique course ids, at most 20', () => {
    expect(parseDemoEnrolments('a-1,a-1,BAD ID,<x>,b-2')).toEqual(['a-1', 'b-2']);
    const many = Array.from({ length: 30 }, (_, i) => `c-${i}`).join(',');
    expect(parseDemoEnrolments(many)).toHaveLength(20);
    expect(addDemoEnrolment(['a-1'], 'a-1')).toBe('a-1');
    expect(addDemoEnrolment(['a-1'], 'b-2')).toBe('a-1,b-2');
  });
});

describe('public tenant sites (D-111)', () => {
  it('exist only for the seeded demo tenants and only while demo content is on', () => {
    expect(getPublicSite('demo-manufacturing', NOW)).toBeNull();
    vi.stubEnv('ENABLE_DEMO_CONTENT', 'true');
    expect(getPublicSite('demo-manufacturing', NOW)?.site.name).toBe('Demo Manufacturing Co');
    expect(getPublicSite('acme', NOW)).toBeNull();
    const course = catalogCourses('demo-tenant-2', NOW)[0]!;
    expect(getPublicCourse('demo-logistics', course.id, NOW)?.course.id).toBe(course.id);
    // Another tenant's course is not on this tenant's site.
    expect(getPublicCourse('demo-manufacturing', course.id, NOW)).toBeNull();
  });
});
