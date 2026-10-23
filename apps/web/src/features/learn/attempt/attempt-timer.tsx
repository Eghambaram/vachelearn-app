'use client';

import * as React from 'react';
import { Timer } from 'lucide-react';
import { formatClock } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import { cn } from '@/lib/utils';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const a = t.attempt;

/** Screen readers hear the time at these points only, not every second (WCAG 2.2.1 / 4.1.3 without noise). */
const ANNOUNCE_AT_SECONDS = [300, 60] as const;

/**
 * Countdown to the server's deadline. Anchored to the server clock: the remaining time at render is
 * `deadlineAt − generatedAt` from the response, then counted down with the monotonic clock, so a wrong device clock
 * cannot add time. The server enforces the deadline either way (D-055); this only shows it.
 */
export function AttemptTimer({
  deadlineAt,
  generatedAt,
  onExpire,
}: {
  deadlineAt: string;
  generatedAt: string;
  onExpire: () => void;
}) {
  const initial = Math.max(
    0,
    Math.floor((Date.parse(deadlineAt) - Date.parse(generatedAt)) / 1000),
  );
  const [remaining, setRemaining] = React.useState(initial);
  const [announcement, setAnnouncement] = React.useState('');
  const labelId = React.useId();
  const onExpireRef = React.useRef(onExpire);
  React.useEffect(() => {
    onExpireRef.current = onExpire;
  });

  React.useEffect(() => {
    if (initial === 0) {
      onExpireRef.current();
      return;
    }
    const started = performance.now();
    let last = initial;
    const id = window.setInterval(() => {
      const next = Math.max(0, initial - Math.floor((performance.now() - started) / 1000));
      if (next === last) return;
      for (const mark of ANNOUNCE_AT_SECONDS) {
        if (last > mark && next <= mark) setAnnouncement(a.minutesLeft(mark / 60));
      }
      last = next;
      setRemaining(next);
      if (next === 0) {
        setAnnouncement(a.timeUp);
        window.clearInterval(id);
        onExpireRef.current();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [initial]);

  const low = remaining <= 60;
  return (
    <div
      data-slot="attempt-timer"
      className={cn(
        'flex w-fit items-center gap-2 rounded-lg border px-3 py-2',
        low ? 'border-danger/40 bg-danger-subtle text-danger' : 'bg-card',
      )}
    >
      <Timer aria-hidden="true" className="size-5 shrink-0" />
      <div className="flex flex-col leading-tight">
        <span id={labelId} className="text-xs">
          {a.timeRemaining}
        </span>
        {/* role="timer" is not announced on every tick; the live region below speaks at set points only. */}
        <span role="timer" aria-labelledby={labelId} className="text-lg font-semibold tabular-nums">
          {formatClock(remaining)}
        </span>
      </div>
      <span aria-live="assertive" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
