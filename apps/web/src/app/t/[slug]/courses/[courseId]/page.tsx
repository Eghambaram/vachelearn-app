import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, LogIn } from 'lucide-react';
import { DemoBadge } from '@/components/demo-badge';
import { Button } from '@/components/ui/button';
import { CourseOverview } from '@/features/catalog/course-overview';
import { getPublicCourse } from '@/lib/api/catalog';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

type Props = { params: Promise<{ slug: string; courseId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, courseId } = await params;
  const found = getPublicCourse(slug, courseId);
  return found
    ? { title: `${found.course.title} · ${found.site.name}`, robots: { index: false } }
    : {};
}

/** Public course page (D-111): what the course covers; enrolling needs a sign-in. Sample data, marked Demo. */
export default async function PublicCoursePage({ params }: Props) {
  const { slug, courseId } = await params;
  const found = getPublicCourse(slug, courseId);
  if (!found) notFound();
  const { site, course } = found;
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Link
        href={`/t/${site.slug}#catalog`}
        className="flex w-fit items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t.catalog.backToCatalog}
      </Link>
      <CourseOverview
        course={course}
        badge={<DemoBadge />}
        action={
          <Button
            asChild
            size="lg"
            className="w-full bg-[var(--site-accent)] text-primary-foreground hover:bg-[var(--site-accent-hover)]"
          >
            <Link href="/login">
              <LogIn aria-hidden="true" />
              {t.catalog.signInToEnrol}
            </Link>
          </Button>
        }
      />
    </div>
  );
}
