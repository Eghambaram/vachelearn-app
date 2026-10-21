'use client';

import type { AssessmentSummary } from '@vachelearn/contracts';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { getMessages } from '@/lib/i18n';
import type { DraftAction } from './draft-reducer';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const a = t.builder.assessment;

const NONE = 'none';

/** Attach an existing assessment as the course's final assessment (building one arrives in Phase 4.4). */
export function AssessmentStep({
  assessmentId,
  assessments,
  dispatch,
}: {
  assessmentId: string | null;
  assessments: readonly AssessmentSummary[];
  dispatch: (action: DraftAction) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm text-muted-foreground">{a.intro}</legend>
      <p id="assessment-choice" className="text-sm font-medium">
        {a.choose}
      </p>
      <RadioGroup
        aria-labelledby="assessment-choice"
        value={assessmentId ?? NONE}
        onValueChange={(value) =>
          dispatch({ type: 'assessment', assessmentId: value === NONE ? null : value })
        }
        className="flex flex-col gap-2"
      >
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <RadioGroupItem value={NONE} id="assessment-none" />
          <Label htmlFor="assessment-none">{a.none}</Label>
        </div>
        {assessments.map((assessment) => (
          <div key={assessment.id} className="flex items-start gap-3 rounded-lg border p-3">
            <RadioGroupItem value={assessment.id} id={assessment.id} className="mt-0.5" />
            <Label htmlFor={assessment.id} className="flex flex-col items-start gap-0.5">
              <span>{assessment.title}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {a.details(assessment.questionCount, assessment.passMarkPercent)}
              </span>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </fieldset>
  );
}
