'use client';

import * as React from 'react';
import type { GroupView } from '@vachelearn/contracts';
import { InlineAlert } from '@/components/inline-alert';
import { ReasonDialog } from '@/components/reason-dialog';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { setGroupArchived } from '@/lib/api/groups';
import { formatDateTime } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import { useApiAction } from '@/lib/use-api-action';
import { GroupForm } from './group-form';
import { groupErrorMessage } from './messages';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const g = t.groups;

/** Group details: read, or edit name and description when the API says this caller manages it (`canManage`). */
export function GroupDetails({ group }: { group: GroupView }) {
  const [editing, setEditing] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const editRef = React.useRef<HTMLButtonElement>(null);
  const savedRef = React.useRef<HTMLDivElement>(null);
  const wasEditing = React.useRef(false);

  // Out of the form: to the saved message after saving, else back to "Edit details" (WCAG 2.4.3).
  React.useEffect(() => {
    if (!editing && wasEditing.current) (saved ? savedRef : editRef).current?.focus();
    wasEditing.current = editing;
  }, [editing, saved]);

  return (
    <section
      aria-labelledby="group-details"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="group-details" className="text-lg font-semibold">
          {g.detailsTitle}
        </h2>
        {group.canManage && !editing ? (
          <Button
            ref={editRef}
            type="button"
            variant="outline"
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
          >
            {g.edit}
          </Button>
        ) : null}
      </div>
      {saved && !editing ? (
        <InlineAlert ref={savedRef} tone="success">
          {g.saved}
        </InlineAlert>
      ) : null}
      {editing ? (
        <GroupForm
          group={group}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setSaved(true);
            setEditing(false);
          }}
        />
      ) : (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
          <dt className="text-sm text-muted-foreground">{g.name}</dt>
          <dd className="break-words">{group.name}</dd>
          <dt className="text-sm text-muted-foreground">{g.descriptionLabel}</dt>
          <dd className="break-words whitespace-pre-line">
            {group.description ?? <span className="text-muted-foreground">{g.none}</span>}
          </dd>
          <dt className="text-sm text-muted-foreground">{g.scopeLabel}</dt>
          <dd>{group.branch ? g.branchScope(group.branch.name) : g.wholeOrganisation}</dd>
        </dl>
      )}
    </section>
  );
}

/** Archive (history kept; no new members) or reactivate, with a reason (D-121). */
export function GroupStatusSection({ group }: { group: GroupView }) {
  const { run, error, done, statusRef, onCloseAutoFocus } = useApiAction(groupErrorMessage);
  const active = group.status === 'active';
  return (
    <section
      aria-labelledby="group-status"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
    >
      <h2 id="group-status" className="text-lg font-semibold">
        {g.statusTitle}
      </h2>
      {error || done ? (
        <InlineAlert ref={statusRef} tone={error ? 'danger' : 'success'}>
          {error ?? done}
        </InlineAlert>
      ) : null}
      <div className="flex flex-col gap-1">
        <StatusBadge entity="group" status={group.status} />
        {group.archivedAt ? (
          <p className="text-sm text-muted-foreground">
            {g.archivedOn(formatDateTime(group.archivedAt))}
          </p>
        ) : null}
        {group.archivedReason ? (
          <p className="text-sm break-words">{g.archivedReason(group.archivedReason)}</p>
        ) : null}
      </div>
      {group.canManage ? (
        <ReasonDialog
          trigger={
            <Button
              type="button"
              variant={active ? 'destructive' : 'outline'}
              className="self-start"
            >
              {active ? g.archive : g.reactivate}
            </Button>
          }
          title={active ? g.archiveTitle(group.name) : g.reactivateTitle(group.name)}
          impact={active ? g.archiveImpact : g.reactivateImpact}
          confirmLabel={active ? g.archive : g.reactivate}
          reasonLabel={g.reason}
          reasonHelp={g.reasonHelp}
          reasonError={g.reasonError}
          destructive={active}
          onCloseAutoFocus={onCloseAutoFocus}
          onConfirm={async (reason) =>
            (
              await run(
                (csrf) => setGroupArchived(group.id, active, reason, csrf),
                active ? g.archived : g.reactivated,
                { from: 'reason-dialog' },
              )
            )?.message ?? null
          }
        />
      ) : null}
    </section>
  );
}
