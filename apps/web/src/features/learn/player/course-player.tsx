import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Captions,
  ClipboardCheck,
  ExternalLink,
  FileText,
  PlayCircle,
} from 'lucide-react';
import type {
  CoursePlayer as CoursePlayerData,
  LessonContent,
  LessonView,
  PlayerLesson,
} from '@vachelearn/contracts';
import { ProgressBar } from '@/components/progress-bar';
import { StickyActions } from '@/components/shell/sticky-actions';
import { Button } from '@/components/ui/button';
import {
  calendarDateIn,
  daysBetween,
  formatClock,
  formatDate,
  formatDateOnly,
  formatDuration,
  formatFileSize,
} from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import { LessonTree } from './lesson-tree';
import { lessonHref } from './paths';
import { NotConnectedAction } from './not-connected-action';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const p = t.player;

type Props = { outline: CoursePlayerData; lesson: LessonView };

/**
 * Course player (UI spec #41, ref 13): course progress, the lesson tree and one lesson. Everything shown about
 * progress and completion is the server's. Opening a lesson never completes it; the completion actions are not
 * connected until Phase 4. Omitted (D-043): notes, discussion, resources, bookmarks, lesson search, quick quiz.
 */
export function CoursePlayer({ outline, lesson }: Props) {
  const { enrollment, modules, timeZone } = outline;
  const flat = modules.flatMap((module, m) =>
    module.lessons.map((l, i) => ({ lesson: l, module, number: `${m + 1}.${i + 1}` })),
  );
  const index = flat.findIndex((entry) => entry.lesson.id === lesson.lessonId);
  const current = flat[index]!;
  const previous = flat[index - 1];
  const next = flat[index + 1];
  const today = calendarDateIn(outline.generatedAt, timeZone);

  return (
    <>
      <section
        aria-label={p.progress(enrollment.courseTitle)}
        className="flex flex-col gap-2 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:gap-6"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <ProgressBar
            value={enrollment.progressPercent}
            label={p.progress(enrollment.courseTitle)}
          />
          <p className="text-sm">
            {p.progressText(
              enrollment.progressPercent,
              enrollment.requiredCompleted,
              enrollment.requiredLessons,
            )}
          </p>
        </div>
        {enrollment.dueOn ? (
          <p
            className={
              enrollment.status === 'overdue'
                ? 'text-sm font-medium text-danger'
                : 'text-sm text-muted-foreground'
            }
          >
            {t.learnerDashboard.due(formatDateOnly(enrollment.dueOn))} ·{' '}
            {enrollment.status === 'overdue'
              ? t.learnerDashboard.overdueBy(daysBetween(enrollment.dueOn, today))
              : enrollment.status === 'completed'
                ? p.lessonState.completed
                : t.learnerDashboard.dueIn(daysBetween(today, enrollment.dueOn))}
          </p>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start">
        <LessonTree
          enrollmentId={enrollment.id}
          modules={modules}
          currentLessonId={lesson.lessonId}
        />

        <article
          aria-labelledby="lesson-heading"
          className="flex min-w-0 flex-col gap-5 rounded-xl border bg-card p-4 sm:p-6"
        >
          <header className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">
              {current.module.title} · {p.position(index + 1, flat.length)}
            </p>
            <h2 id="lesson-heading" className="text-xl font-semibold sm:text-2xl">
              {current.number} {current.lesson.title}
            </h2>
            <p className="text-sm text-muted-foreground sm:text-base">{lesson.summary}</p>
          </header>

          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{p.typeLabel}</dt>
              <dd className="font-medium">{p.lessonType[current.lesson.type]}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{p.durationLabel}</dt>
              <dd className="font-medium">{formatDuration(current.lesson.durationMinutes)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{p.requirementLabel}</dt>
              <dd className="font-medium">{current.lesson.required ? p.required : p.optional}</dd>
            </div>
          </dl>

          <LessonBody content={lesson.content} timeZone={timeZone} />

          <Completion
            lesson={current.lesson}
            completedAt={lesson.completedAt}
            timeZone={timeZone}
          />

          <StickyActions className="justify-between">
            {previous ? (
              <Button asChild variant="outline">
                <Link href={lessonHref(enrollment.id, previous.lesson.id)}>
                  <ArrowLeft aria-hidden="true" />
                  {p.previous}
                  <span className="sr-only">{` (${previous.number} ${previous.lesson.title})`}</span>
                </Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                <ArrowLeft aria-hidden="true" />
                {p.previous}
              </Button>
            )}
            {next ? (
              <Button asChild>
                <Link href={lessonHref(enrollment.id, next.lesson.id)}>
                  {p.next}
                  <span className="sr-only">{` (${next.number} ${next.lesson.title})`}</span>
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : (
              <Button disabled>
                {p.next}
                <ArrowRight aria-hidden="true" />
              </Button>
            )}
          </StickyActions>
        </article>
      </div>
    </>
  );
}

function LessonBody({ content, timeZone }: { content: LessonContent; timeZone: string }) {
  switch (content.type) {
    case 'text':
      return (
        <div className="flex max-w-prose flex-col gap-3 text-base leading-relaxed">
          {content.paragraphs.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      );
    case 'video':
      return (
        <figure className="flex flex-col gap-3">
          <div
            data-slot="mock-video"
            className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg bg-sidebar p-4 text-center text-sidebar-foreground"
          >
            <PlayCircle aria-hidden="true" className="size-10 sm:size-12" />
            <p className="max-w-md text-sm">{p.video.noMedia}</p>
          </div>
          <figcaption className="flex flex-col gap-1.5 text-sm">
            <span className="sr-only">{p.video.label}</span>
            <ProgressBar
              value={content.percentWatched}
              label={p.video.watched(content.percentWatched)}
            />
            <span>
              {p.video.position(
                formatClock(content.positionSeconds),
                formatClock(content.durationSeconds),
              )}{' '}
              · {p.video.watched(content.percentWatched)}
            </span>
            {content.hasCaptions ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Captions aria-hidden="true" className="size-4" />
                {p.video.captions}
              </span>
            ) : null}
          </figcaption>
        </figure>
      );
    case 'document':
      return (
        <div className="flex flex-col gap-2 rounded-lg border p-4">
          <p className="flex items-center gap-2 font-medium wrap-anywhere">
            <FileText aria-hidden="true" className="size-5 shrink-0 text-primary" />
            {content.fileName}
          </p>
          <p className="text-sm text-muted-foreground">
            {p.document.details(content.pageCount, formatFileSize(content.sizeBytes))}
          </p>
          <p className="text-sm">{p.document.noFile}</p>
          {content.acknowledgedAt ? (
            <p className="text-sm text-success">
              {p.document.acknowledgedOn(formatDate(content.acknowledgedAt, { timeZone }))}
            </p>
          ) : null}
        </div>
      );
    case 'link':
      return (
        <div className="flex flex-col gap-2 rounded-lg border p-4">
          <a
            href={content.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-fit items-center gap-2 font-medium text-primary underline underline-offset-4"
          >
            {content.label}
            <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
            <span className="sr-only"> {p.link.opensNewTab}</span>
          </a>
          <p className="text-sm text-muted-foreground">{p.link.note}</p>
        </div>
      );
    case 'assessment':
      return (
        <div className="flex flex-col gap-2 rounded-lg border p-4">
          <p className="flex items-center gap-2 font-medium">
            <ClipboardCheck aria-hidden="true" className="size-5 shrink-0 text-primary" />
            {content.assessmentTitle}
          </p>
          <p className="text-sm text-muted-foreground">
            {p.assessment.details(content.questionCount, content.passMarkPercent)}
          </p>
          <p className="text-sm">{p.assessment.notYet}</p>
        </div>
      );
  }
}

/** How this lesson completes (D-041) and, only where the rule allows it, the learner's completion action. */
function Completion({
  lesson,
  completedAt,
  timeZone,
}: {
  lesson: PlayerLesson;
  completedAt: string | null;
  timeZone: string;
}) {
  const action =
    lesson.completionRule === 'manual'
      ? p.markComplete
      : lesson.completionRule === 'acknowledged'
        ? p.acknowledge
        : null;
  return (
    <section aria-label={p.completionLabel} className="flex flex-col gap-3 rounded-lg bg-muted p-4">
      {completedAt ? (
        <p className="text-sm font-medium text-success">
          {p.completedOn(formatDate(completedAt, { timeZone }))}
        </p>
      ) : (
        <>
          <p className="text-sm">
            {p.rule[lesson.completionRule]}{' '}
            <span className="text-muted-foreground">{p.ruleProposed}</span>
          </p>
          {action ? <NotConnectedAction label={action} /> : null}
        </>
      )}
    </section>
  );
}
