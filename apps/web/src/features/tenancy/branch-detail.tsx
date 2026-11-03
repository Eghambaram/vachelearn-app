'use client';

import * as React from 'react';
import type { BranchView } from '@vachelearn/contracts';
import { InlineAlert } from '@/components/inline-alert';
import { ReasonDialog } from '@/components/reason-dialog';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { setBranchActive } from '@/lib/api/tenancy';
import { formatDateTime } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import { useApiAction } from '@/lib/use-api-action';
import { BranchForm } from './branch-form';
import { branchErrorMessage } from './messages';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const b = t.branches;

/** Branch details: read, or edit for `branch.update` (the code never changes). */
export function BranchDetails({ branch, editable }: { branch: BranchView; editable: boolean }) {
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

  const row = (label: string, value: string | null) => (
    <>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-words">
        {value ?? <span className="text-muted-foreground">{b.none}</span>}
      </dd>
    </>
  );

  return (
    <section
      aria-labelledby="branch-details"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="branch-details" className="text-lg font-semibold">
          {b.detailsTitle}
        </h2>
        {editable && !editing ? (
          <Button
            ref={editRef}
            type="button"
            variant="outline"
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
          >
            {b.edit}
          </Button>
        ) : null}
      </div>
      {saved && !editing ? (
        <InlineAlert ref={savedRef} tone="success">
          {b.saved}
        </InlineAlert>
      ) : null}
      {editing ? (
        <BranchForm
          branch={branch}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setSaved(true);
            setEditing(false);
          }}
        />
      ) : (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
          {row(b.code, branch.code)}
          {row(b.name, branch.name)}
          {row(b.timezone, branch.timezone.replaceAll('_', ' '))}
          {row(b.addressLine, branch.addressLine)}
          {row(b.city, branch.city)}
          {row(b.region, branch.region)}
          {row(b.countryCode, branch.countryCode)}
        </dl>
      )}
    </section>
  );
}

/** Branch status (`branch.deactivate`): deactivation keeps members and history; roles on it grant nothing (D-090). */
export function BranchStatusSection({
  branch,
  manageable,
}: {
  branch: BranchView;
  manageable: boolean;
}) {
  const { run, error, done, statusRef, onCloseAutoFocus } = useApiAction(branchErrorMessage);
  const active = branch.status === 'active';
  return (
    <section
      aria-labelledby="branch-status"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
    >
      <h2 id="branch-status" className="text-lg font-semibold">
        {b.statusTitle}
      </h2>
      {error || done ? (
        <InlineAlert ref={statusRef} tone={error ? 'danger' : 'success'}>
          {error ?? done}
        </InlineAlert>
      ) : null}
      <div className="flex flex-col gap-1">
        <StatusBadge entity="branch" status={branch.status} />
        {branch.deactivatedAt ? (
          <p className="text-sm text-muted-foreground">
            {b.deactivatedOn(formatDateTime(branch.deactivatedAt))}
          </p>
        ) : null}
        {branch.deactivatedReason ? (
          <p className="text-sm break-words">{b.deactivatedReason(branch.deactivatedReason)}</p>
        ) : null}
      </div>
      {manageable ? (
        <ReasonDialog
          trigger={
            <Button
              type="button"
              variant={active ? 'destructive' : 'outline'}
              className="self-start"
            >
              {active ? b.deactivate : b.reactivate}
            </Button>
          }
          title={active ? b.deactivateTitle(branch.name) : b.reactivateTitle(branch.name)}
          impact={active ? b.deactivateImpact : b.reactivateImpact}
          confirmLabel={active ? b.deactivate : b.reactivate}
          reasonLabel={b.reason}
          reasonHelp={b.reasonHelp}
          reasonError={b.reasonError}
          destructive={active}
          onCloseAutoFocus={onCloseAutoFocus}
          onConfirm={async (reason) =>
            (
              await run(
                (csrf) => setBranchActive(branch.id, !active, reason, csrf),
                active ? b.deactivated : b.reactivated,
                { from: 'reason-dialog' },
              )
            )?.message ?? null
          }
        />
      ) : null}
    </section>
  );
}
