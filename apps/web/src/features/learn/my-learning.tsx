import Link from 'next/link';
import { BookOpen, CalendarClock, CheckCircle2 } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { ProgressBar } from '@/components/progress-bar';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import type { MyLearningItem } from '@/lib/api/learner';
import { daysBetween, formatDate, formatDateOnly } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import { cn } from '@/lib/utils';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const m = t.myLearning;
const l = t.learnerDashboard;

export const MY_LEARNING_FILTERS = [
  'all',
  'in_progress',
  'not_started',
  'overdue',
  'completed',
] as const;
export type MyLearningFilter = (typeof MY_LEARNING_FILTERS)[number];

const FILTER_LABEL: Record<MyLearningFilter, string> = {
  all: m.all,
  in_progress: l.inProgress,
  not_started: l.notStarted,
  overdue: l.overdue,
  completed: l.completed,
};

/**
 * My learning (UI spec #40): the learner's own enrolments with status, progress and due date as the server computes
 * them, filterable by status with plain links (shareable, work without JavaScript).
 */
export function MyLearning({
  items,
  filter,
  today,
  timeZone,
}: {
  items: readonly MyLearningItem[];
  filter: MyLearningFilter;
  today: string;
  timeZone: string;
}) {
  const count = (f: MyLearningFilter) =>
    f === 'all' ? items.length : items.filter((i) => i.status === f).length;
  const shown = filter === 'all' ? items : items.filter((i) => i.status === filter);

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label={m.filterLabel} className="flex flex-wrap gap-2">
        {MY_LEARNING_FILTERS.map((f) => {
          const active = f === filter;
          return (
            <Link
              key={f}
              href={f === 'all' ? '/learn/my-learning' : `/learn/my-learning?status=${f}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors',
                active
                  ? 'border-transparent bg-primary text-primary-foreground'
                  : 'bg-card hover:bg-muted',
              )}
            >
              {FILTER_LABEL[f]}
              <span className={active ? '' : 'text-muted-foreground'}>{m.count(count(f))}</span>
            </Link>
          );
        })}
      </nav>

      {shown.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title={items.length === 0 ? m.emptyTitle : m.emptyFilterTitle}
          description={items.length === 0 ? m.emptyBody : undefined}
          action={
            <Button asChild variant="outline">
              <Link href={items.length === 0 ? '/learn/catalog' : '/learn/my-learning'}>
                {items.length === 0 ? m.browseCatalog : m.showAll}
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((item) => (
            <li
              key={item.enrollmentId}
              className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 className="text-base leading-snug font-semibold">{item.courseTitle}</h2>
                  <p className="text-xs text-muted-foreground">
                    {l.version(item.courseVersion)} · {m.lessons(item.lessonCount)}
                  </p>
                </div>
                <StatusBadge entity="enrollment" status={item.status} />
              </div>

              <div className="flex flex-col gap-1.5">
                <ProgressBar value={item.progressPercent} label={l.progress(item.courseTitle)} />
                <p className="text-sm">{l.percentComplete(item.progressPercent)}</p>
              </div>

              <div className="flex flex-col gap-1 text-sm">
                {item.nextLessonTitle ? (
                  <p className="text-muted-foreground">{l.next(item.nextLessonTitle)}</p>
                ) : null}
                {item.completedAt ? (
                  <p className="flex items-center gap-1.5 text-success">
                    <CheckCircle2 aria-hidden="true" className="size-4" />
                    {l.completedOn(formatDate(item.completedAt, { timeZone }))}
                  </p>
                ) : item.dueOn ? (
                  <p
                    className={cn(
                      'flex items-center gap-1.5',
                      item.status === 'overdue' && 'font-medium text-danger',
                    )}
                  >
                    <CalendarClock aria-hidden="true" className="size-4" />
                    {l.due(formatDateOnly(item.dueOn))} ·{' '}
                    {item.status === 'overdue'
                      ? l.overdueBy(daysBetween(item.dueOn, today))
                      : l.dueIn(daysBetween(today, item.dueOn))}
                  </p>
                ) : null}
              </div>

              <Button
                asChild
                variant={item.status === 'completed' ? 'outline' : 'default'}
                className="mt-auto self-start"
              >
                <Link href={`/learn/courses/${encodeURIComponent(item.enrollmentId)}`}>
                  {item.status === 'completed'
                    ? m.review
                    : item.status === 'not_started'
                      ? m.start
                      : l.continue}
                  <span className="sr-only"> {item.courseTitle}</span>
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
