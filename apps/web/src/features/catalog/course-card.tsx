import Link from 'next/link';
import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Factory,
  GraduationCap,
  Layers,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { formatDuration } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { CatalogCourse } from './types';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const c = t.catalog;

const CATEGORY_ICON: Record<string, LucideIcon> = {
  Safety: ShieldCheck,
  'Technical skills': Wrench,
  Compliance: ClipboardCheck,
  Leadership: Users,
  Operations: Factory,
};

/** A course's decorative visual: its category icon on a soft accent field (no stock imagery). */
export function CourseVisual({
  category,
  size = 'md',
}: {
  category: string | null;
  size?: 'md' | 'lg';
}) {
  const Icon = (category && CATEGORY_ICON[category]) || BookOpen;
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative flex items-center justify-center overflow-hidden bg-[color-mix(in_srgb,var(--site-accent,var(--vl-color-primary))_10%,var(--vl-color-surface))]',
        size === 'lg' ? 'h-40 rounded-2xl' : 'h-28',
      )}
    >
      <div className="absolute -top-10 -right-8 size-32 rounded-full bg-[color-mix(in_srgb,var(--site-accent,var(--vl-color-primary))_14%,var(--vl-color-surface))]" />
      <div className="absolute -bottom-12 -left-6 size-28 rounded-full bg-[color-mix(in_srgb,var(--site-accent,var(--vl-color-primary))_8%,var(--vl-color-surface))]" />
      <span className="relative flex size-14 items-center justify-center rounded-2xl bg-card text-[var(--site-accent,var(--vl-color-primary))] shadow-sm ring-1 ring-border">
        <Icon className="size-7" />
      </span>
    </div>
  );
}

export function CourseMeta({ course }: { course: CatalogCourse }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <GraduationCap aria-hidden="true" className="size-4" />
        {t.courses.levels[course.level]}
      </li>
      <li className="flex items-center gap-1.5">
        <Clock aria-hidden="true" className="size-4" />
        {formatDuration(course.durationMinutes)}
      </li>
      <li className="flex items-center gap-1.5">
        <Layers aria-hidden="true" className="size-4" />
        {c.modules(course.moduleCount)}
      </li>
    </ul>
  );
}

/**
 * A catalog course card: the whole card is one link (to the course page), named by the course title. Shows the
 * learner's enrolment state when there is one.
 */
export function CourseCard({
  course,
  href,
  enrollment = null,
}: {
  course: CatalogCourse;
  href: string;
  enrollment?: { completed: boolean } | null;
}) {
  return (
    <li className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow duration-200 focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
      <CourseVisual category={course.category?.name ?? null} />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold tracking-wide text-[var(--site-accent,var(--vl-color-primary))] uppercase">
            {course.category?.name ?? t.courses.deliveryModes[course.deliveryMode]}
          </p>
          {enrollment ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success">
              <CheckCircle2 aria-hidden="true" className="size-3.5" />
              {enrollment.completed ? c.completed : c.enrolled}
            </span>
          ) : null}
        </div>
        <h3 className="text-lg leading-snug font-semibold">
          <Link href={href} className="outline-none after:absolute after:inset-0">
            {course.title}
          </Link>
        </h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">{course.summary}</p>
        <div className="mt-auto pt-2">
          <CourseMeta course={course} />
        </div>
      </div>
    </li>
  );
}
