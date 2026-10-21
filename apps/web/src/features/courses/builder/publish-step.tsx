'use client';

import { CircleAlert, CircleCheck } from 'lucide-react';
import {
  nextVersionNumber,
  type CourseDraft,
  type PublishIssue,
  type PublishStep,
} from '@vachelearn/contracts';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/format';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const p = t.builder.publish;

/**
 * Publish checklist from the shared `publishIssues` rule (the API enforces the same function). Publishing is not
 * connected in Phase 1 (D-067): the button reports that instead of pretending to succeed.
 */
export function PublishPanel({
  draft,
  issues,
  onGoTo,
  onPublish,
}: {
  draft: CourseDraft;
  issues: readonly PublishIssue[];
  onGoTo: (step: PublishStep) => void;
  onPublish: () => void;
}) {
  const next = nextVersionNumber(draft);
  const lessons = draft.modules.flatMap((m) => m.lessons);
  const minutes = lessons.reduce((sum, l) => sum + l.durationMinutes, 0);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {p.summary(draft.modules.length, lessons.length, formatDuration(minutes))}
      </p>
      {issues.length === 0 ? (
        <p className="flex items-center gap-2 font-medium text-success">
          <CircleCheck aria-hidden="true" className="size-5" />
          {p.ready}
        </p>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-danger/30 bg-danger-subtle p-4">
          <h3 className="flex items-center gap-2 font-semibold text-danger">
            <CircleAlert aria-hidden="true" className="size-5" />
            {p.notReady}
          </h3>
          <ul className="flex flex-col gap-2">
            {issues.map((issue) => (
              <li
                key={issue.code}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>{p.issues[issue.code as keyof typeof p.issues] ?? issue.code}</span>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => onGoTo(issue.step)}
                >
                  {p.goTo(t.builder.steps[issue.step])}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-sm">{p.versionNote(next, draft.publishedVersion)}</p>
      <Button className="self-start" disabled={issues.length > 0} onClick={onPublish}>
        {p.publish(next)}
      </Button>
    </div>
  );
}
