import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import type { UpcomingDeadline } from '@vachelearn/contracts';
import { DemoBadge } from '@/components/demo-badge';
import { EmptyState } from '@/components/empty-state';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { calendarDateIn, daysBetween, formatDateOnly, formatNumber } from '@/lib/format';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const d = t.tenantDashboard.deadlines;

/** Next course due dates in scope. "In N days" counts calendar days in the tenant timezone. */
export function UpcomingDeadlines({
  deadlines,
  generatedAt,
  timeZone,
  demo,
  canViewAssignments,
}: {
  /** `assignment.create` — the link is shown only to roles that can open assignments. */
  canViewAssignments: boolean;
  deadlines: readonly UpcomingDeadline[];
  generatedAt: string;
  timeZone: string;
  demo: boolean;
}) {
  const today = calendarDateIn(generatedAt, timeZone);
  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto]">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">{d.title}</h2>
          {demo ? <DemoBadge /> : null}
        </div>
        {canViewAssignments ? (
          <Link
            href="/admin/assignments"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {d.viewAll}
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>
        {deadlines.length === 0 ? (
          <EmptyState headingLevel="h3" icon={<CalendarClock />} title={d.emptyTitle} />
        ) : (
          <ol aria-label={d.caption} className="flex flex-col divide-y">
            {deadlines.map((deadline) => (
              <li
                key={`${deadline.courseId}-${deadline.dueOn}`}
                className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">{deadline.courseTitle}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatNumber(deadline.learnersOutstanding)} {d.learners.toLowerCase()}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                  <time dateTime={deadline.dueOn} className="text-sm font-medium tabular-nums">
                    {formatDateOnly(deadline.dueOn)}
                  </time>
                  <span className="text-xs text-warning">
                    {d.inDays(daysBetween(today, deadline.dueOn))}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
