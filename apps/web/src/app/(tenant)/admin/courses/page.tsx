import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { DemoBadge } from '@/components/demo-badge';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { Button } from '@/components/ui/button';
import { CourseList } from '@/features/courses/course-list';
import { parseDemoState } from '@/lib/api/client';
import { listCategories, listCourses } from '@/lib/api/courses';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.courses.title };

type Props = { searchParams: Promise<{ demoState?: string }> };

/** Course management list (UI spec #21). First page rendered on the server; later pages via a server action. */
export default async function CoursesPage({ searchParams }: Props) {
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
        meta={session.demo ? <DemoBadge /> : null}
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
