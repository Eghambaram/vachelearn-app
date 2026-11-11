import * as React from 'react';
import { Award, Check, ChevronDown, FileText, PlayCircle, HelpCircle } from 'lucide-react';
import { formatDuration } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import type { CatalogCourse } from './types';
import { CourseMeta, CourseVisual } from './course-card';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const c = t.catalog;

const LESSON_ICON = { video: PlayCircle, document: FileText, quiz: HelpCircle } as const;

/**
 * A catalog course page body (learner catalog and public tenant page): what it is, what you learn, the outline, and a
 * facts card holding the page's call to action (`action`).
 */
export function CourseOverview({
  course,
  action,
  badge,
}: {
  course: CatalogCourse;
  action: React.ReactNode;
  badge?: React.ReactNode;
}) {
  const lessons = course.modules.flatMap((m) => m.lessons);
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-8">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold tracking-wide text-[var(--site-accent,var(--vl-color-primary))] uppercase">
              {course.category?.name ?? t.courses.deliveryModes[course.deliveryMode]}
            </p>
            {badge}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{course.title}</h1>
          <p className="max-w-2xl text-lg text-muted-foreground">{course.summary}</p>
          <CourseMeta course={course} />
        </header>

        <section aria-labelledby="outcomes" className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 id="outcomes" className="text-lg font-semibold">
            {c.outcomesTitle}
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {course.outcomes.map((outcome) => (
              <li key={outcome} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success">
                  <Check aria-hidden="true" className="size-3.5" />
                </span>
                {outcome}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="outline" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="outline" className="text-lg font-semibold">
              {c.outlineTitle}
            </h2>
            <p className="text-sm text-muted-foreground">
              {c.modules(course.modules.length)} · {c.lessons(lessons.length)}
            </p>
          </div>
          <ol className="flex flex-col gap-2">
            {course.modules.map((module, m) => (
              <li key={module.id}>
                <details open={m === 0} className="group rounded-xl border bg-card">
                  <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold">
                      {m + 1}
                    </span>
                    <span className="flex-1 font-medium">{module.title}</span>
                    <span className="text-sm text-muted-foreground">
                      {c.lessons(module.lessons.length)}
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <ul className="flex flex-col border-t px-4 py-2">
                    {module.lessons.map((lesson) => {
                      const Icon = LESSON_ICON[lesson.type as keyof typeof LESSON_ICON] ?? FileText;
                      return (
                        <li key={lesson.id} className="flex items-center gap-3 py-2 text-sm">
                          <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                          <span className="flex-1">{lesson.title}</span>
                          {lesson.required ? null : (
                            <span className="text-xs text-muted-foreground">{c.optional}</span>
                          )}
                          <span className="text-muted-foreground tabular-nums">
                            {formatDuration(lesson.durationMinutes)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside aria-labelledby="facts" className="lg:sticky lg:top-24 lg:self-start">
        <div className="flex flex-col gap-5 overflow-hidden rounded-2xl border bg-card shadow-sm">
          <CourseVisual category={course.category?.name ?? null} />
          <div className="flex flex-col gap-5 px-6 pb-6">
            <h2 id="facts" className="text-base font-semibold">
              {c.detailsTitle}
            </h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">{c.level}</dt>
              <dd className="font-medium">{t.courses.levels[course.level]}</dd>
              <dt className="text-muted-foreground">{c.delivery}</dt>
              <dd className="font-medium">{t.courses.deliveryModes[course.deliveryMode]}</dd>
              <dt className="text-muted-foreground">{c.duration}</dt>
              <dd className="font-medium">{formatDuration(course.durationMinutes)}</dd>
              <dt className="text-muted-foreground">{c.content}</dt>
              <dd className="font-medium">{c.lessons(lessons.length)}</dd>
              <dt className="text-muted-foreground">{c.version}</dt>
              <dd className="font-medium">v{course.publishedVersion ?? 1}</dd>
            </dl>
            <p className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm">
              <Award
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-[var(--site-accent,var(--vl-color-primary))]"
              />
              {c.certificateNote}
            </p>
            {action}
          </div>
        </div>
      </aside>
    </div>
  );
}
