'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CircleCheck, CircleDashed, FlaskConical, Send } from 'lucide-react';
import type { AnswerMap, AttemptQuestion, AttemptView } from '@vachelearn/contracts';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ProgressBar } from '@/components/progress-bar';
import { StickyActions } from '@/components/shell/sticky-actions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { lessonHref } from '@/features/learn/player/paths';
import { getMessages } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { AttemptTimer } from './attempt-timer';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const a = t.attempt;

type Taking = Extract<AttemptView['body'], { kind: 'taking' }>;
type Props = { data: AttemptView & { body: Taking }; demo: boolean };

const LETTERS = 'ABCDEFGHIJ';

/**
 * Taking an open attempt (UI spec #42, ref 05 panel 6): one question at a time, a question navigator, a review step and
 * submit. Selections start from the answers the server holds. In Phase 1 they change in this page only (D-071) and
 * submitting is not connected; nothing is scored in the browser — the server scores (D-042, D-072).
 */
export function AttemptTaker({ data, demo }: Props) {
  const { questions } = data.body;
  const [answers, setAnswers] = React.useState<AnswerMap>(data.body.savedAnswers);
  const [view, setView] = React.useState<number | 'review'>(0);
  const [expired, setExpired] = React.useState(false);
  const [notConnected, setNotConnected] = React.useState(false);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  const isAnswered = (q: AttemptQuestion) => (answers[q.id]?.length ?? 0) > 0;
  const answeredCount = questions.filter(isAnswered).length;
  const attemptLabel = a.attemptOf(data.attempt.attemptNumber, data.assessment.attemptLimit);

  function go(next: number | 'review') {
    setView(next);
    // Keyboard and screen-reader users land on the new question (or the review heading).
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function select(question: AttemptQuestion, optionId: string, checked: boolean) {
    if (expired) return;
    setAnswers((prev) => {
      const current = prev[question.id] ?? [];
      const next =
        question.type === 'multiple'
          ? checked
            ? [...current, optionId]
            : current.filter((id) => id !== optionId)
          : [optionId];
      return { ...prev, [question.id]: next };
    });
  }

  const index = view === 'review' ? questions.length - 1 : view;
  const question = questions[index]!;

  return (
    <div className="flex flex-col gap-5">
      {demo ? (
        <p
          role="note"
          className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-subtle px-4 py-3 text-sm font-medium text-warning"
        >
          <FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {a.demoBanner}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-sm font-medium">{a.answeredOf(answeredCount, questions.length)}</p>
          <ProgressBar
            value={Math.round((answeredCount * 100) / questions.length)}
            label={a.answeredOf(answeredCount, questions.length)}
            className="max-w-md"
          />
        </div>
        {data.attempt.deadlineAt ? (
          <AttemptTimer
            deadlineAt={data.attempt.deadlineAt}
            generatedAt={data.generatedAt}
            onExpire={() => setExpired(true)}
          />
        ) : null}
      </div>

      {expired ? (
        <div
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger-subtle p-4 text-sm text-danger"
        >
          <p className="font-semibold">{a.timeUp}</p>
          <p>{a.timeUpRule}</p>
        </div>
      ) : null}

      <nav aria-label={a.questionsLabel}>
        <ol className="flex flex-wrap gap-2">
          {questions.map((q, i) => {
            const answered = isAnswered(q);
            const current = view === i;
            return (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={current ? 'step' : undefined}
                  aria-label={a.navItem(i + 1, answered)}
                  className={cn(
                    'flex h-9 min-w-9 items-center justify-center gap-1 rounded-md border px-2 text-sm font-medium tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring',
                    answered ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
                    current && 'border-2 border-foreground',
                  )}
                >
                  {answered ? (
                    <CircleCheck aria-hidden="true" className="size-3.5" />
                  ) : (
                    <CircleDashed aria-hidden="true" className="size-3.5 text-muted-foreground" />
                  )}
                  {i + 1}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {view === 'review' ? (
        <section
          aria-labelledby="attempt-heading"
          className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
        >
          <h2
            id="attempt-heading"
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-semibold outline-none"
          >
            {a.reviewTitle}
          </h2>
          <p className="text-sm">{a.reviewSummary(answeredCount, questions.length)}</p>
          <ol className="flex flex-col divide-y rounded-md border">
            {questions.map((q, i) => (
              <li
                key={q.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium tabular-nums">{i + 1}.</span> {q.stem}
                  <span
                    className={cn('block text-xs', isAnswered(q) ? 'text-success' : 'text-warning')}
                  >
                    {isAnswered(q) ? a.answered : a.notAnswered}
                  </span>
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => go(i)}>
                  {a.goToQuestion(i + 1)}
                </Button>
              </li>
            ))}
          </ol>
          <ConfirmDialog
            trigger={
              <Button type="button" className="self-start" disabled={expired}>
                <Send aria-hidden="true" />
                {a.submit}
              </Button>
            }
            title={a.submitTitle}
            impact={a.submitImpact(attemptLabel.toLowerCase(), questions.length - answeredCount)}
            confirmLabel={a.submit}
            onConfirm={() => setNotConnected(true)}
          />
          <p role="status" className="text-sm font-medium text-warning">
            {notConnected ? a.notConnected : ''}
          </p>
        </section>
      ) : (
        <QuestionCard
          key={question.id}
          question={question}
          number={index + 1}
          total={questions.length}
          selected={answers[question.id] ?? []}
          disabled={expired}
          headingRef={headingRef}
          onSelect={(optionId, checked) => select(question, optionId, checked)}
        />
      )}

      <StickyActions className="justify-between">
        {view === 'review' ? (
          <Button type="button" variant="outline" onClick={() => go(questions.length - 1)}>
            <ArrowLeft aria-hidden="true" />
            {a.backToQuestion(questions.length)}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={view === 0}
            onClick={() => go(index - 1)}
          >
            <ArrowLeft aria-hidden="true" />
            {a.previousQuestion}
          </Button>
        )}
        {view === 'review' ? (
          <Button asChild variant="outline">
            <Link href={lessonHref(data.enrollment.id, data.enrollment.lessonId)}>
              {a.backToCourse}
            </Link>
          </Button>
        ) : view === questions.length - 1 ? (
          <Button type="button" onClick={() => go('review')}>
            {a.reviewAnswers}
            <ArrowRight aria-hidden="true" />
          </Button>
        ) : (
          <Button type="button" onClick={() => go(index + 1)}>
            {a.nextQuestion}
            <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </StickyActions>
    </div>
  );
}

function QuestionCard({
  question,
  number,
  total,
  selected,
  disabled,
  headingRef,
  onSelect,
}: {
  question: AttemptQuestion;
  number: number;
  total: number;
  selected: readonly string[];
  disabled: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onSelect: (optionId: string, checked: boolean) => void;
}) {
  const multiple = question.type === 'multiple';
  const hintId = React.useId();
  const optionRow = (optionId: string) =>
    cn(
      'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-muted',
      disabled && 'cursor-not-allowed opacity-70',
      selected.includes(optionId) && 'font-medium',
    );

  return (
    <section
      aria-labelledby="attempt-heading"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          {a.questionOf(number, total)} · {a.points(question.points)}
        </p>
        <h2
          id="attempt-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold outline-none sm:text-xl"
        >
          {question.stem}
        </h2>
        <p id={hintId} className="text-sm text-muted-foreground">
          {multiple ? a.selectAll : a.selectOne}
        </p>
      </div>
      {multiple ? (
        <div
          role="group"
          aria-labelledby="attempt-heading"
          aria-describedby={hintId}
          className="grid gap-2"
        >
          {question.options.map((option, i) => (
            <label key={option.id} htmlFor={option.id} className={optionRow(option.id)}>
              <Checkbox
                id={option.id}
                checked={selected.includes(option.id)}
                disabled={disabled}
                onCheckedChange={(checked) => onSelect(option.id, checked === true)}
              />
              <span aria-hidden="true" className="w-4 font-semibold text-muted-foreground">
                {LETTERS[i]}
              </span>
              {option.label}
            </label>
          ))}
        </div>
      ) : (
        <RadioGroup
          aria-labelledby="attempt-heading"
          aria-describedby={hintId}
          value={selected[0] ?? ''}
          disabled={disabled}
          onValueChange={(value) => onSelect(value, true)}
        >
          {question.options.map((option, i) => (
            <label key={option.id} htmlFor={option.id} className={optionRow(option.id)}>
              <RadioGroupItem id={option.id} value={option.id} />
              <span aria-hidden="true" className="w-4 font-semibold text-muted-foreground">
                {LETTERS[i]}
              </span>
              {option.label}
            </label>
          ))}
        </RadioGroup>
      )}
    </section>
  );
}
