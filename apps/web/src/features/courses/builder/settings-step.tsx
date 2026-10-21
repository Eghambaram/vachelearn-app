'use client';

import type { CourseDraft, CourseVisibility } from '@vachelearn/contracts';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { getMessages } from '@/lib/i18n';
import type { DraftAction } from './draft-reducer';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const s = t.builder.settings;

export function SettingsStep({
  settings,
  hasAssessment,
  dispatch,
}: {
  settings: CourseDraft['settings'];
  hasAssessment: boolean;
  dispatch: (action: DraftAction) => void;
}) {
  const patch = (p: Partial<CourseDraft['settings']>) => dispatch({ type: 'settings', patch: p });
  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{s.visibility}</legend>
        <RadioGroup
          value={settings.visibility}
          onValueChange={(visibility) => patch({ visibility: visibility as CourseVisibility })}
          className="flex flex-col gap-2"
        >
          {(
            [
              ['assigned_only', s.assignedOnly, s.assignedOnlyHelp],
              ['catalog', s.catalog, s.catalogHelp],
            ] as const
          ).map(([value, label, help]) => (
            <div key={value} className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem
                value={value}
                id={`visibility-${value}`}
                aria-describedby={`visibility-${value}-help`}
                className="mt-0.5"
              />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor={`visibility-${value}`}>{label}</Label>
                <span id={`visibility-${value}-help`} className="text-xs text-muted-foreground">
                  {help}
                </span>
              </div>
            </div>
          ))}
        </RadioGroup>
      </fieldset>

      <div className="flex items-start gap-3">
        <Switch
          id="self-enrollment"
          checked={settings.selfEnrollment}
          aria-describedby="self-enrollment-help"
          onCheckedChange={(selfEnrollment) => patch({ selfEnrollment })}
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="self-enrollment">{s.selfEnrollment}</Label>
          <span id="self-enrollment-help" className="text-xs text-muted-foreground">
            {s.selfEnrollmentHelp}
          </span>
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">{s.completion}</legend>
        <div className="flex items-center gap-3">
          <Checkbox id="completion-lessons" checked disabled />
          <Label htmlFor="completion-lessons">{s.completionLessons}</Label>
        </div>
        <div className="flex items-center gap-3">
          <Checkbox
            id="completion-assessment"
            checked={settings.requirePassingAssessment}
            onCheckedChange={(checked) => patch({ requirePassingAssessment: checked === true })}
          />
          <Label htmlFor="completion-assessment">{s.requirePassing}</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          {s.completionNote}
          {settings.requirePassingAssessment && !hasAssessment
            ? ` ${t.builder.publish.issues.assessment_required}`
            : ''}
        </p>
      </fieldset>
    </div>
  );
}
