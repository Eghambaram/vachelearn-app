import * as React from 'react';
import { Check, CircleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export type StepState = 'complete' | 'current' | 'upcoming' | 'error';

export type Step = {
  id: string;
  label: string;
  description?: string;
  /** Overrides the state derived from `currentIndex`, e.g. `error` for a step that failed validation. */
  state?: StepState;
};

type StepperProps = {
  steps: readonly Step[];
  /** Zero-based index of the step in progress. Earlier steps are complete, later ones upcoming. */
  currentIndex: number;
  'aria-label'?: string;
  /** Vertical always; horizontal from the `md` breakpoint when `responsive` (default). */
  orientation?: 'responsive' | 'vertical';
  className?: string;
};

export function stepState(step: Step, index: number, currentIndex: number): StepState {
  if (step.state) return step.state;
  if (index < currentIndex) return 'complete';
  return index === currentIndex ? 'current' : 'upcoming';
}

const MARKER_CLASS: Record<StepState, string> = {
  complete: 'border-primary bg-primary text-primary-foreground',
  current: 'border-primary bg-card text-primary',
  upcoming: 'border-input bg-card text-muted-foreground',
  error: 'border-danger bg-danger-subtle text-danger',
};

/** Progress through a multi-step flow (course builder, import wizard). Display only — it does not navigate. */
export function Stepper({
  steps,
  currentIndex,
  'aria-label': ariaLabel = t.stepper.label,
  orientation = 'responsive',
  className,
}: StepperProps) {
  const responsive = orientation === 'responsive';
  return (
    <div role="group" aria-label={ariaLabel} className={className}>
      <p className="sr-only">
        {t.stepper.stepOf(Math.min(currentIndex + 1, steps.length), steps.length)}
      </p>
      <ol className={cn('flex flex-col gap-4', responsive && 'md:flex-row md:gap-2')}>
        {steps.map((step, index) => {
          const state = stepState(step, index, currentIndex);
          return (
            <li
              key={step.id}
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
              className={cn('flex flex-1 items-start gap-3', responsive && 'md:flex-col md:gap-2')}
            >
              <div className={cn('flex items-center gap-2', responsive && 'md:w-full')}>
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold tabular-nums',
                    MARKER_CLASS[state],
                  )}
                >
                  {state === 'complete' ? (
                    <Check className="size-4" />
                  ) : state === 'error' ? (
                    <CircleAlert className="size-4" />
                  ) : (
                    index + 1
                  )}
                </span>
                {index < steps.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'hidden h-0.5 flex-1 rounded-full',
                      responsive && 'md:block',
                      state === 'complete' ? 'bg-primary' : 'bg-border',
                    )}
                  />
                ) : null}
              </div>
              <div className="flex min-w-0 flex-col gap-0.5 pt-1 md:pt-0">
                <span
                  className={cn(
                    'text-sm font-medium',
                    state === 'upcoming' && 'text-muted-foreground',
                    state === 'error' && 'text-danger',
                  )}
                >
                  {step.label}
                  <span className="sr-only"> ({t.stepper[state]})</span>
                </span>
                {step.description ? (
                  <span className="text-xs text-muted-foreground">{step.description}</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
