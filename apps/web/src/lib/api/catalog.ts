import { isDemoContentEnabled } from '@/lib/dev-tools';
import { catalogCourse, catalogCourses, demoSite, type CatalogCourse } from '@/mocks/catalog';
import { demoError, type ApiResult } from './client';
import { getContentSession } from './content-session';
import { ownEnrollments } from './learner';

/*
 * The demo course catalog (D-110) and public tenant sites (D-111): sample data, until the published-catalog API
 * (Phase 3) and self-enrolment (Phase 4). The learner catalog reads the session (`catalog.browse`); the public site is
 * reachable only for the seeded demo tenants and only while demo content is on.
 */

export type CatalogEntry = CatalogCourse & {
  /** The learner's live enrolment in this course, if any (sample data). */
  enrollment: { id: string; completed: boolean } | null;
};

export type Catalog = {
  courses: CatalogEntry[];
  canSelfEnrol: boolean;
};

async function enrollmentIndex(now: Date) {
  const own = await ownEnrollments(now);
  const index = new Map<string, { id: string; completed: boolean }>();
  for (const e of own?.mine ?? []) {
    if (e.status === 'cancelled' || index.has(e.courseTitle)) continue;
    index.set(e.courseTitle, { id: e.id, completed: e.status === 'completed' });
  }
  return index;
}

export async function getCatalog(now = new Date()): Promise<ApiResult<Catalog>> {
  const session = await getContentSession();
  // A real session while demo content is off has no catalog yet (D-097): not found, so the enrol action fails too.
  if (!session.demoContent) {
    return {
      ok: false,
      status: 404,
      error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'req_demo_0404' },
    };
  }
  if (!session.activeTenantId || !session.permissions.includes('catalog.browse')) {
    return demoError(403);
  }
  const index = await enrollmentIndex(now);
  return {
    ok: true,
    data: {
      courses: catalogCourses(session.activeTenantId, now).map((course) => ({
        ...course,
        enrollment: index.get(course.title) ?? null,
      })),
      canSelfEnrol: session.permissions.includes('enrollment.self_enroll'),
    },
  };
}

export async function getCatalogCourse(
  courseId: string,
  now = new Date(),
): Promise<ApiResult<CatalogEntry & { canSelfEnrol: boolean }>> {
  const catalog = await getCatalog(now);
  if (!catalog.ok) return catalog;
  const course = catalog.data.courses.find((c) => c.id === courseId);
  if (!course) {
    return {
      ok: false,
      status: 404,
      error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'req_demo_0404' },
    };
  }
  return { ok: true, data: { ...course, canSelfEnrol: catalog.data.canSelfEnrol } };
}

/** A demo tenant's public site and catalog, or null (unknown slug, or demo content off). */
export function getPublicSite(slug: string, now = new Date()) {
  if (!isDemoContentEnabled()) return null;
  const site = demoSite(slug);
  if (!site) return null;
  return { site, courses: catalogCourses(site.demoTenantId, now) };
}

export function getPublicCourse(slug: string, courseId: string, now = new Date()) {
  if (!isDemoContentEnabled()) return null;
  const site = demoSite(slug);
  const course = site ? catalogCourse(site.demoTenantId, courseId, now) : null;
  return site && course ? { site, course } : null;
}
