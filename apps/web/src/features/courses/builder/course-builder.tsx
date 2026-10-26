'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FlaskConical } from 'lucide-react';
import {
  publishIssues,
  type AssessmentSummary,
  type Category,
  type CourseDraft,
  type PublishStep,
} from '@vachelearn/contracts';
import { Stepper } from '@/components/stepper';
import { Button } from '@/components/ui/button';
import { getMessages } from '@/lib/i18n';
import { draftReducer } from './draft-reducer';
import { AssessmentStep } from './assessment-step';
import { BasicsStep } from './basics-step';
import { ContentStep } from './content-step';
import { PublishPanel } from './publish-step';
import { SettingsStep } from './settings-step';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const b = t.builder;

export const BUILDER_STEPS = ['basics', 'content', 'assessment', 'settings', 'publish'] as const;
export type BuilderStep = (typeof BUILDER_STEPS)[number];

export function parseStep(value: unknown): BuilderStep {
  return (BUILDER_STEPS as readonly unknown[]).includes(value) ? (value as BuilderStep) : 'basics';
}

/**
 * Course builder (UI spec #22): Basic information → Content → Assessment → Settings → Publish. The draft lives in this
 * component only (D-067): nothing is saved, and Save/Publish say so. The step is in the URL (`?step=`), replaced in
 * place so the draft survives moving between steps.
 */
export function CourseBuilder({
  initialDraft,
  categories,
  assessments,
}: {
  initialDraft: CourseDraft;
  categories: readonly Category[];
  assessments: readonly AssessmentSummary[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const step = parseStep(searchParams.get('step'));
  const index = BUILDER_STEPS.indexOf(step);
  const [draft, dispatch] = React.useReducer(draftReducer, initialDraft);
  const [notConnected, setNotConnected] = React.useState(false);
  // Once the author follows a checklist fix, every step shows its open issues on the fields themselves.
  const [showIssues, setShowIssues] = React.useState(false);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const issues = publishIssues(draft);
  const stepsWithIssues = new Set<PublishStep>(issues.map((issue) => issue.step));

  function goTo(next: BuilderStep, focusIssue?: string) {
    const params = new URLSearchParams(searchParams);
    params.set('step', next);
    setNotConnected(false);
    pendingFocus.current = { issue: focusIssue ?? null };
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Once the new step has rendered, move focus to the field with the issue, else to the step's heading, so keyboard
  // and screen-reader users land in the right place. (Focusing straight after `router.replace` ran before the step
  // existed in a real browser.)
  const pendingFocus = React.useRef<{ issue: string | null } | null>(null);
  React.useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    const field = pending.issue
      ? document.querySelector<HTMLElement>(`[data-issue~="${pending.issue}"]`)
      : null;
    (field ?? headingRef.current)?.focus();
  }, [step]);

  return (
    <div className="flex flex-col gap-6">
      <p
        role="note"
        className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-subtle px-4 py-3 text-sm font-medium text-warning"
      >
        <FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {b.demoBanner}
      </p>

      <Stepper
        aria-label={b.stepsLabel}
        currentIndex={index}
        onStepSelect={(i) => goTo(BUILDER_STEPS[i]!)}
        steps={BUILDER_STEPS.map((key) => ({
          id: key,
          label: b.steps[key],
          // Only flag problems once the author has reached Publish, so a new course is not all red at the start.
          state:
            key !== 'publish' && step === 'publish' && stepsWithIssues.has(key as PublishStep)
              ? 'error'
              : undefined,
        }))}
      />

      <section aria-labelledby="builder-step-heading" className="flex flex-col gap-4">
        <h2
          id="builder-step-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold outline-none"
        >
          {b.steps[step]}
        </h2>
        {showIssues && step !== 'basics' && step !== 'publish' ? (
          <StepIssues codes={issues.filter((issue) => issue.step === step).map((i) => i.code)} />
        ) : null}
        {step === 'basics' ? (
          <BasicsStep
            basics={draft.basics}
            categories={categories}
            dispatch={dispatch}
            issues={showIssues ? issues.map((issue) => issue.code) : []}
          />
        ) : step === 'content' ? (
          <ContentStep modules={draft.modules} dispatch={dispatch} />
        ) : step === 'assessment' ? (
          <AssessmentStep
            assessmentId={draft.assessment.assessmentId}
            assessments={assessments}
            dispatch={dispatch}
          />
        ) : step === 'settings' ? (
          <SettingsStep
            settings={draft.settings}
            hasAssessment={draft.assessment.assessmentId !== null}
            dispatch={dispatch}
          />
        ) : (
          <PublishPanel
            draft={draft}
            issues={issues}
            onGoTo={(issue) => {
              setShowIssues(true);
              goTo(issue.step, issue.code);
            }}
            onPublish={() => setNotConnected(true)}
          />
        )}
      </section>

      <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={index === 0}
            onClick={() => goTo(BUILDER_STEPS[index - 1]!)}
          >
            {b.back}
          </Button>
          {step !== 'publish' ? (
            <Button onClick={() => goTo(BUILDER_STEPS[index + 1]!)}>{b.continue}</Button>
          ) : null}
        </div>
        <Button variant="secondary" onClick={() => setNotConnected(true)}>
          {b.saveDraft}
        </Button>
      </div>
      <p role="status" className="text-sm font-medium text-warning">
        {notConnected ? b.notConnected : ''}
      </p>
    </div>
  );
}

/** Open publish issues of a step that are not tied to a single field (content, assessment), focusable as a target. */
function StepIssues({ codes }: { codes: readonly string[] }) {
  if (codes.length === 0) return null;
  return (
    <ul
      tabIndex={-1}
      data-issue={codes.join(' ')}
      className="flex flex-col gap-1 rounded-lg border border-danger/30 bg-danger-subtle p-3 text-sm text-danger outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
    >
      {codes.map((code) => (
        <li key={code}>{b.publish.issues[code as keyof typeof b.publish.issues] ?? code}</li>
      ))}
    </ul>
  );
}
