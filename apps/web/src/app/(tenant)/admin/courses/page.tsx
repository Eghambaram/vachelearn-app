import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { DemoBadge } from '@/components/demo-badge';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { Button } from '@/components/ui/button';
import { CourseAdminList } from '@/features/course-admin/course-list';
import { CourseList } from '@/features/courses/course-list';
import { parseDemoState } from '@/lib/api/client';
import { readAdminCourses, readCatalogItems } from '@/lib/api/course-admin-server';
import { listCategories, listCourses } from '@/lib/api/courses';
import { getSession } from '@/lib/api/session';
import type { SessionView } from '@/lib/api/session-types';
import { getMessages } from '@/lib/i18n';
import { notAvailableForRealSession } from '@/components/shell/workspace';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.courses.title };

type Props = { searchParams: Promise<{ demoState?: string }> };

// Per request: the real list comes from the API with the caller's session.
export const dynamic = 'force-dynamic';

/**
 * Course management list (UI spec #21). Real sessions read the API (Slice 3.3, D-127: drafts included for every course
 * reader); demo sessions, and tenants with demo content on (D-110), keep the Phase 1 sample list.
 */
export default async function CoursesPage({ searchParams }: Props) {
  // Null for demo content; otherwise the real screen (or the "session unavailable" state it carries).
  const notAvailable = await notAvailableForRealSession('/admin/courses');
  if (notAvailable) {
    const real = await getSession().catch(() => null);
    return real ? <RealCourses session={real} /> : notAvailable;
  }
  const session = await getSession();
  const demoState = session.demo ? parseDemoState((await searchParams).demoState) : 'ready';
  if (!session.permissions.includes('course.read') || demoState === 'forbidden') {
    return <PermissionDenied headingLevel="h1" />;
  }
  const [initial, categories] = await Promise.all([
    demoState === 'loading' ? null : listCourses({}, { demoState }),
    listCategories(),
  ]);
  return (
    <>
      <PageHeader
        title={t.courses.title}
        description={t.courses.description}
        meta={session.demoContent ? <DemoBadge /> : null}
        actions={
          // Shown only to roles that may create courses; the API checks `course.create` again.
          session.permissions.includes('course.create') ? (
            <Button asChild>
              <Link href="/admin/courses/new/build">
                <Plus aria-hidden="true" />
                {t.builder.createCourse}
              </Link>
            </Button>
          ) : null
        }
      />
      <CourseList
        initial={initial}
        categories={categories.ok ? categories.data.data : []}
        demoState={demoState}
        canEdit={session.permissions.includes('course.update')}
      />
    </>
  );
}

/** The real course list (Slice 3.3). The API decides what the caller sees; the checks here only pick the state. */
async function RealCourses({ session }: { session: SessionView }) {
  if (!session.permissions.includes('course.read')) return <PermissionDenied headingLevel="h1" />;
  const [initial, categories] = await Promise.all([
    readAdminCourses({ sort: 'updatedAt', direction: 'desc' }),
    readCatalogItems('category', { limit: '100' }),
  ]);
  if (!initial.ok && initial.status === 403) return <PermissionDenied headingLevel="h1" />;
  // The API checks `course.create` again.
  const canCreate = session.permissions.includes('course.create') && !session.support;
  return (
    <>
      <PageHeader
        title={t.courseAdmin.title}
        description={t.courseAdmin.description}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/admin/courses/new">
                <Plus aria-hidden="true" />
                {t.courseAdmin.add}
              </Link>
            </Button>
          ) : null
        }
      />
      <CourseAdminList
        initial={initial}
        categories={categories.ok ? categories.data.data : []}
        canCreate={canCreate}
      />
    </>
  );
}
