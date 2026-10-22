import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DemoBadge } from '@/components/demo-badge';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { StatusBadge } from '@/components/status-badge';
import { CourseBuilder } from '@/features/courses/builder/course-builder';
import { parseDemoState } from '@/lib/api/client';
import { getCourseDraft } from '@/lib/api/course-draft';
import { listCategories } from '@/lib/api/courses';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const b = t.builder;

type Props = {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ demoState?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  if (courseId === 'new') return { title: b.newCourse };
  const result = await getCourseDraft(courseId);
  return { title: result.ok ? result.data.draft.basics.title || b.untitled : t.courses.title };
}

/** Course builder (UI spec #22) for `course.create` (new) / `course.update` (existing). Edits are local (D-067). */
export default async function CourseBuilderPage({ params, searchParams }: Props) {
  const { courseId } = await params;
  const session = await getSession();
  const demoState = session.demo ? parseDemoState((await searchParams).demoState) : 'ready';
  const [result, categories] = await Promise.all([
    getCourseDraft(courseId, { demoState }),
    listCategories(),
  ]);
  if (!result.ok) {
    if (result.status === 404) notFound();
    if (result.status === 403) return <PermissionDenied headingLevel="h1" />;
    return <ErrorState headingLevel="h1" requestId={result.error.requestId} />;
  }
  const { draft, assessments, archived } = result.data;
  const title = courseId === 'new' ? b.newCourse : draft.basics.title || b.untitled;
  const status = archived ? 'archived' : draft.publishedVersion === null ? 'draft' : 'published';
  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[
          { label: b.breadcrumbCourses, href: '/admin/courses' },
          { label: title },
        ]}
        meta={
          <>
            {courseId === 'new' ? null : <StatusBadge entity="course" status={status} />}
            {session.demo ? <DemoBadge /> : null}
          </>
        }
        description={
          draft.publishedVersion === null ? b.neverPublished : b.publishedAs(draft.publishedVersion)
        }
      />
      {archived ? (
        <p className="rounded-lg border bg-muted px-4 py-3 text-sm">{b.archived}</p>
      ) : (
        <CourseBuilder
          initialDraft={draft}
          categories={categories.ok ? categories.data.data : []}
          assessments={assessments}
        />
      )}
    </>
  );
}
