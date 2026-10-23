import Link from 'next/link';
import { ArrowLeft, ClipboardCheck, Clock } from 'lucide-react';
import type { AttemptView } from '@vachelearn/contracts';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { NotConnectedAction } from '@/features/learn/player/not-connected-action';
import { attemptHref, lessonHref } from '@/features/learn/player/paths';
import { formatDateTime, formatPercentTenths } from '@/lib/format';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const a = t.attempt;

type Result = Extract<AttemptView['body'], { kind: 'result' }>;

/**
 * A graded attempt (UI spec #42). Score, pass mark and outcome only — no questions and no per-question correctness
 * (D-023). Passing the assessment is shown as one requirement of the course, not as course completion or a
 * certificate (spec §8). Every earlier attempt stays listed; a retake is offered only when D-073 allows it.
 */
export function AttemptResult({ data }: { data: AttemptView & { body: Result } }) {
  const { score } = data.body;
  const { attempt, assessment, enrollment, timeZone } = data;
  const nextAttempt = data.history.length + 1;
  const attemptsLeft =
    assessment.attemptLimit === null || data.history.length < assessment.attemptLimit;

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="result-heading"
        className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="result-heading" className="text-xl font-semibold">
            {a.resultTitle}
          </h2>
          <StatusBadge entity="attempt" status={attempt.status} />
        </div>
        <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
          <dl>
            <dt className="text-sm text-muted-foreground">{a.scoreLabel}</dt>
            <dd className="text-3xl font-semibold tabular-nums">
              {formatPercentTenths(score.scorePercentTenths)}
            </dd>
            <dd className="text-sm">{a.scoreDetail(score.scorePoints, score.possiblePoints)}</dd>
          </dl>
          <div className="flex flex-col gap-1 text-sm">
            <p>{a.passMark(assessment.passMarkPercent)}</p>
            {attempt.submittedAt ? (
              <p>{a.submittedOn(formatDateTime(attempt.submittedAt, { timeZone }))}</p>
            ) : null}
          </div>
        </div>
        {attempt.timedOut ? (
          <p className="flex items-start gap-2 text-sm font-medium text-warning">
            <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {a.timedOut}
          </p>
        ) : null}
        <p className="text-sm">
          {score.passed ? a.passedNote(enrollment.courseTitle) : a.failedNote}
        </p>
        <p className="text-sm text-muted-foreground">{a.keyNote}</p>
        <div className="flex flex-wrap items-start gap-3">
          {data.canRetake ? (
            <NotConnectedAction
              label={a.startAttempt(nextAttempt, assessment.attemptLimit)}
              message={a.startNotConnected}
              icon={<ClipboardCheck aria-hidden="true" />}
            />
          ) : null}
          {!score.passed && !attemptsLeft ? (
            <p className="text-sm font-medium">{a.noAttemptsLeft}</p>
          ) : null}
          <Button asChild variant="outline">
            <Link href={lessonHref(enrollment.id, enrollment.lessonId)}>
              <ArrowLeft aria-hidden="true" />
              {a.backToCourse}
            </Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <h2 id="history-heading" className="text-lg font-semibold">
          {a.historyTitle}
        </h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{a.historyAttempt}</TableHead>
                <TableHead scope="col">{a.historySubmitted}</TableHead>
                <TableHead scope="col">{a.historyScore}</TableHead>
                <TableHead scope="col">{a.historyResult}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.history.map((h) => {
                const label = a.attemptOf(h.attemptNumber, assessment.attemptLimit);
                return (
                  <TableRow key={h.id} aria-current={h.id === attempt.id ? 'true' : undefined}>
                    <TableCell>
                      {h.id === attempt.id ? (
                        <span className="font-medium">
                          {label} <span className="text-muted-foreground">{a.thisAttempt}</span>
                        </span>
                      ) : (
                        <Link
                          href={attemptHref(h.id)}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {label}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell>
                      {h.submittedAt ? formatDateTime(h.submittedAt, { timeZone }) : a.notSubmitted}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {h.scorePercentTenths === null
                        ? '—'
                        : formatPercentTenths(h.scorePercentTenths)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge entity="attempt" status={h.status} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
