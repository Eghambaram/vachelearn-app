'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown, CircleCheck, CircleDashed, CircleDot } from 'lucide-react';
import type { LessonProgressState, PlayerModule } from '@vachelearn/contracts';
import { formatDuration } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { lessonHref } from './paths';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const p = t.player;

// Shape differs per state, so progress never depends on colour alone (WCAG 1.4.1); the state is also in text.
const STATE_ICON = {
  completed: { Icon: CircleCheck, className: 'text-success' },
  in_progress: { Icon: CircleDot, className: 'text-info' },
  not_started: { Icon: CircleDashed, className: 'text-muted-foreground' },
} as const satisfies Record<LessonProgressState, unknown>;

/**
 * Module and lesson navigation for the player (ref 13, left column). Progress comes from the server. Desktop: always
 * shown beside the lesson. Phones: a disclosure above the lesson, closed by default so the lesson comes first.
 */
export function LessonTree({
  enrollmentId,
  modules,
  currentLessonId,
}: {
  enrollmentId: string;
  modules: readonly PlayerModule[];
  currentLessonId: string;
}) {
  const [open, setOpen] = React.useState(false);
  const listId = React.useId();
  const all = modules.flatMap((m) => m.lessons);
  const done = all.filter((l) => l.progress === 'completed').length;

  return (
    <nav
      aria-label={p.contentTitle}
      data-slot="lesson-tree"
      className="rounded-xl border bg-card lg:sticky lg:top-4"
    >
      <h2 className="hidden px-4 pt-4 text-base font-semibold lg:block">{p.contentTitle}</h2>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-4 text-left text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden"
      >
        {p.contentToggle(done, all.length)}
        <ChevronDown
          aria-hidden="true"
          className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>
      <ol id={listId} className={cn('flex-col gap-4 p-4 lg:flex', open ? 'flex' : 'hidden')}>
        {modules.map((module, m) => {
          const moduleDone = module.lessons.filter((l) => l.progress === 'completed').length;
          return (
            <li key={module.id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 text-sm font-semibold">
                <span>
                  {m + 1}. {module.title}
                </span>
                <span className="shrink-0 text-xs font-normal text-muted-foreground">
                  {p.moduleProgress(moduleDone, module.lessons.length)}
                </span>
              </div>
              <ol className="flex flex-col">
                {module.lessons.map((lesson, l) => {
                  const current = lesson.id === currentLessonId;
                  const { Icon, className } = STATE_ICON[lesson.progress];
                  return (
                    <li key={lesson.id}>
                      <Link
                        href={lessonHref(enrollmentId, lesson.id)}
                        aria-current={current ? 'page' : undefined}
                        className={cn(
                          'flex min-h-10 items-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                          current && 'bg-muted font-semibold',
                        )}
                      >
                        <Icon
                          aria-hidden="true"
                          className={cn('mt-0.5 size-4 shrink-0', className)}
                        />
                        <span className="tabular-nums">
                          {m + 1}.{l + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          {lesson.title}
                          <span className="sr-only">
                            {' '}
                            · {p.lessonState[lesson.progress]}
                            {current ? ` · ${p.current}` : ''}
                          </span>
                          {lesson.required ? null : (
                            <span className="block text-xs font-normal text-muted-foreground">
                              {p.optional}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs font-normal text-muted-foreground">
                          {formatDuration(lesson.durationMinutes)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
