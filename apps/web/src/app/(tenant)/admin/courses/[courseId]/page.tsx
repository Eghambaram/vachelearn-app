import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { ReloadButton } from '@/components/reload-button';
import { StatusBadge } from '@/components/status-badge';
import { CourseBasics, NewCourse } from '@/features/course-admin/course-forms';
import { readAdminCourse, readCatalogItems } from '@/lib/api/course-admin-server';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const c = t.courseAdmin;

export const metadata: Metadata = { title: c.title };

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = { params: Promise<{ courseId: string }> };

/**
 * A real course (Slice 3.3): `new` creates one; otherwise its header and draft basics. A course the caller cannot see is
 * "not found" (the API answers 404). Demo sessions and demo-content tenants keep the Phase 1 builder.
 */
export default async function CoursePage({ params }: Props) {
  const { courseId } = await params;
  const session = await getSession();
  if (session.demoContent) redirect(`/admin/courses/${encodeURIComponent(courseId)}/build`);
  const perms = new Set(session.permissions);
  const activeCategories = () => readCatalogItems('category', { status: 'active', limit: '100' });

  if (courseId === 'new') {
    if (!perms.has('course.create') || session.support) {
      return <PermissionDenied headingLevel="h1" />;
    }
    const categories = await activeCategories();
    return (
      <>
        <PageHeader
          title={c.newTitle}
          description={c.newDescription}
          breadcrumbs={[{ label: c.breadcrumb, href: '/admin/courses' }, { label: c.newTitle }]}
        />
        <NewCourse categories={categories.ok ? categories.data.data : []} />
      </>
    );
  }

  if (!perms.has('course.read')) return <PermissionDenied headingLevel="h1" />;
  const back = (
    <Link
      href="/admin/courses"
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      {c.backToCourses}
    </Link>
  );
  const result = UUID.test(courseId) ? await readAdminCourse(courseId) : null;
  if (!result || (!result.ok && result.status === 404)) {
    return (
      <EmptyState
        headingLevel="h1"
        title={c.notFoundTitle}
        description={c.notFoundBody}
        action={back}
      />
    );
  }
  if (!result.ok && result.status === 403) return <PermissionDenied headingLevel="h1" />;
  if (!result.ok) {
    return (
      <ErrorState
        headingLevel="h1"
        requestId={result.error.requestId === 'none' ? undefined : result.error.requestId}
        action={<ReloadButton />}
      />
    );
  }
  const course = result.data;
  const [categories, tags] = course.draft
    ? await Promise.all([
        activeCategories(),
        readCatalogItems('tag', { status: 'active', limit: '100' }),
      ])
    : [null, null];
  const title = course.draft?.title ?? c.title;
  return (
    <>
      <PageHeader
        title={title}
        description={c.detailDescription(course.slug)}
        meta={
          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StatusBadge entity="course" status={course.status} />
            <span>{c.owner(course.owner.displayName)}</span>
          </span>
        }
        breadcrumbs={[{ label: c.breadcrumb, href: '/admin/courses' }, { label: title }]}
      />
      <div className="flex flex-col gap-6">
        <p className="text-sm text-muted-foreground">{c.laterSteps}</p>
        {course.draft ? (
          <CourseBasics
            course={{ ...course, draft: course.draft }}
            categories={categories?.ok ? categories.data.data : []}
            tags={tags?.ok ? tags.data.data : []}
          />
        ) : (
          <p>{c.noDraft}</p>
        )}
      </div>
    </>
  );
}
