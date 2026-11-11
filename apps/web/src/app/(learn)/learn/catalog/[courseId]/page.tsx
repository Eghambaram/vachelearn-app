import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { DemoBadge } from '@/components/demo-badge';
import { PermissionDenied } from '@/components/permission-denied';
import { notAvailableForRealSession, notAvailableMetadata } from '@/components/shell/workspace';
import { Button } from '@/components/ui/button';
import { EnrolButton } from '@/features/catalog/enrol-button';
import { CourseOverview } from '@/features/catalog/course-overview';
import { getCatalogCourse } from '@/lib/api/catalog';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const c = t.catalog;

type Props = { params: Promise<{ courseId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // Real sessions with demo content off never run the sample-data fetcher, even for the title (D-097).
  const notAvailable = await notAvailableMetadata('/learn/catalog');
  if (notAvailable) return notAvailable;
  const course = await getCatalogCourse((await params).courseId).catch(() => null);
  return { title: course?.ok ? course.data.title : c.title };
}

/** A catalog course (demo content, D-110): outline and details; a learner enrols, others see why they cannot. */
export default async function CatalogCoursePage({ params }: Props) {
  const notAvailable = await notAvailableForRealSession('/learn/catalog');
  if (notAvailable) return notAvailable;
  const result = await getCatalogCourse((await params).courseId);
  if (!result.ok) {
    if (result.status === 404) notFound();
    return <PermissionDenied headingLevel="h1" />;
  }
  const course = result.data;
  const action = course.enrollment ? (
    <Button asChild size="lg" className="w-full">
      <Link href={`/learn/courses/${course.enrollment.id}`}>
        {c.continue}
        <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  ) : course.canSelfEnrol ? (
    <div className="flex flex-col gap-2">
      <EnrolButton courseId={course.id} />
      <p className="text-xs text-muted-foreground">{c.demoEnrolNote}</p>
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">{c.selfEnrolOnly}</p>
  );
  return (
    <>
      <Link
        href="/learn/catalog"
        className="flex w-fit items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {c.backToCatalog}
      </Link>
      <CourseOverview course={course} action={action} badge={<DemoBadge />} />
    </>
  );
}
