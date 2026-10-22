import Link from 'next/link';
import { Award, CircleAlert, CircleDashed, GraduationCap, Loader } from 'lucide-react';
import type { LearnerDashboard as LearnerDashboardData } from '@vachelearn/contracts';
import { DemoBadge } from '@/components/demo-badge';
import { EmptyState } from '@/components/empty-state';
import { KpiCard } from '@/components/kpi-card';
import { ProgressBar } from '@/components/progress-bar';
import { StickyActions } from '@/components/shell/sticky-actions';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { calendarDateIn, daysBetween, formatDate, formatDateOnly } from '@/lib/format';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const l = t.learnerDashboard;

const playerHref = (enrollmentId: string) => `/learn/courses/${enrollmentId}`;

/**
 * Learner dashboard (UI spec #39, ref 03). Everything shown is the learner's own and computed by the server: progress
 * (D-016), overdue (D-054), completion and certificate state, which are shown separately (spec §8 AC). Omitted until
 * decided: recommendations, achievements, announcements, learning plans; sessions arrive with the classroom flag.
 */
export function LearnerDashboard({ data, demo }: { data: LearnerDashboardData; demo: boolean }) {
  const today = calendarDateIn(data.generatedAt, data.timeZone);
  const { summary } = data;
  const nothingAssigned =
    summary.notStarted + summary.inProgress + summary.overdue + summary.completed === 0;
  const resume = data.continueLearning[0];

  if (nothingAssigned) {
    return <EmptyState icon={<GraduationCap />} title={l.emptyTitle} description={l.emptyBody} />;
  }

  return (
    <>
      <section aria-label={l.summaryLabel} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          demo={demo}
          label={l.notStarted}
          icon={<CircleDashed />}
          value={String(summary.notStarted)}
        />
        <KpiCard
          demo={demo}
          label={l.inProgress}
          icon={<Loader />}
          value={String(summary.inProgress)}
        />
        <KpiCard
          demo={demo}
          label={l.overdue}
          icon={<CircleAlert />}
          value={String(summary.overdue)}
        />
        <KpiCard
          demo={demo}
          label={l.completed}
          icon={<Award />}
          value={String(summary.completed)}
        />
      </section>

      <section aria-labelledby="continue-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="continue-heading" className="text-lg font-semibold">
            {l.continueTitle}
          </h2>
          <Link
            href="/learn/my-learning"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {l.viewAll}
          </Link>
        </div>
        {data.continueLearning.length === 0 ? (
          <EmptyState headingLevel="h3" title={l.continueEmpty} description={l.continueEmptyBody} />
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {data.continueLearning.map((item) => (
              <li key={item.enrollmentId}>
                <Card className="h-full px-(--card-spacing)">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold">{item.courseTitle}</h3>
                    <StatusBadge entity="enrollment" status={item.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">{l.version(item.courseVersion)}</p>
                  <div className="flex flex-col gap-1.5">
                    <ProgressBar
                      value={item.progressPercent}
                      label={l.progress(item.courseTitle)}
                    />
                    <p className="text-sm">{l.percentComplete(item.progressPercent)}</p>
                  </div>
                  {item.nextLessonTitle ? (
                    <p className="text-sm text-muted-foreground">{l.next(item.nextLessonTitle)}</p>
                  ) : null}
                  {item.dueOn ? (
                    <p
                      className={
                        item.status === 'overdue' ? 'text-sm font-medium text-danger' : 'text-sm'
                      }
                    >
                      {l.due(formatDateOnly(item.dueOn))} ·{' '}
                      {item.status === 'overdue'
                        ? l.overdueBy(daysBetween(item.dueOn, today))
                        : l.dueIn(daysBetween(today, item.dueOn))}
                    </p>
                  ) : null}
                  <Button asChild className="mt-auto self-start">
                    <Link href={playerHref(item.enrollmentId)}>
                      {l.continue}
                      <span className="sr-only"> {item.courseTitle}</span>
                    </Link>
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">{l.deadlinesTitle}</h2>
              {demo ? <DemoBadge /> : null}
            </div>
          </CardHeader>
          <CardContent>
            {data.deadlines.length === 0 ? (
              <EmptyState headingLevel="h3" title={l.deadlinesEmpty} />
            ) : (
              <ol className="flex flex-col divide-y">
                {data.deadlines.map((d) => (
                  <li
                    key={d.enrollmentId}
                    className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-sm font-medium">{d.courseTitle}</span>
                      <StatusBadge entity="enrollment" status={d.status} />
                    </div>
                    <div className="flex flex-col items-end gap-0.5 text-right">
                      <time dateTime={d.dueOn} className="text-sm font-medium tabular-nums">
                        {formatDateOnly(d.dueOn)}
                      </time>
                      <span
                        className={
                          d.status === 'overdue'
                            ? 'text-xs font-medium text-danger'
                            : 'text-xs text-muted-foreground'
                        }
                      >
                        {d.status === 'overdue'
                          ? l.overdueBy(daysBetween(d.dueOn, today))
                          : l.dueIn(daysBetween(today, d.dueOn))}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="grid-cols-[1fr_auto]">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">{l.completedTitle}</h2>
              {demo ? <DemoBadge /> : null}
            </div>
            <Link
              href="/learn/certificates"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {l.viewCertificates}
            </Link>
          </CardHeader>
          <CardContent>
            {data.recentlyCompleted.length === 0 ? (
              <EmptyState headingLevel="h3" title={l.completedEmpty} />
            ) : (
              <ul className="flex flex-col divide-y">
                {data.recentlyCompleted.map((c) => (
                  <li
                    key={c.enrollmentId}
                    className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="text-sm font-medium">{c.courseTitle}</span>
                    <span className="text-xs text-muted-foreground">
                      {l.completedOn(formatDate(c.completedAt, { timeZone: data.timeZone }))}
                    </span>
                    {c.certificate ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-success">
                        <Award aria-hidden="true" className="size-3.5" />
                        {l.certificateIssued(
                          formatDate(c.certificate.issuedAt, { timeZone: data.timeZone }),
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{l.noCertificate}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {resume ? (
        // Phones: the next step stays in reach at the bottom of the screen (web rules, learner experience).
        <StickyActions className="sm:hidden">
          <Button asChild className="w-full">
            <Link href={playerHref(resume.enrollmentId)}>
              {l.continueCourse(resume.courseTitle)}
            </Link>
          </Button>
        </StickyActions>
      ) : null}
    </>
  );
}
