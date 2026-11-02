'use client';

import type { PersonView } from '@vachelearn/contracts';
import { InlineAlert } from '@/components/inline-alert';
import { ReasonDialog } from '@/components/reason-dialog';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { setPersonActive } from '@/lib/api/people';
import { formatDate } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import { useMemberAction } from './use-member-action';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const p = t.people;

/**
 * Membership status (D-102): deactivation signs the member out of this organisation at once and keeps roles, branches
 * and history; reactivation restores them. Both need a reason (audited). The reason is shown only to admins who can
 * deactivate (D-106: the API leaves it out for everyone else).
 */
export function PersonStatus({
  person,
  canDeactivate,
  canReactivate,
}: {
  person: PersonView;
  canDeactivate: boolean;
  canReactivate: boolean;
}) {
  const { run, error, done, statusRef, onCloseAutoFocus } = useMemberAction();
  const active = person.status === 'active';
  const allowed = active ? canDeactivate : canReactivate;

  return (
    <section
      aria-labelledby="person-status"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
    >
      <h2 id="person-status" className="text-lg font-semibold">
        {p.statusTitle}
      </h2>
      {error || done ? (
        <InlineAlert ref={statusRef} tone={error ? 'danger' : 'success'}>
          {error ?? done}
        </InlineAlert>
      ) : null}
      <div className="flex flex-col gap-1">
        <StatusBadge entity="member" status={person.status} />
        {person.deactivatedAt ? (
          <p className="text-sm text-muted-foreground">
            {p.deactivatedOn(formatDate(person.deactivatedAt))}
          </p>
        ) : null}
        {person.deactivatedReason ? (
          <p className="text-sm">{p.deactivatedReason(person.deactivatedReason)}</p>
        ) : null}
      </div>
      {allowed ? (
        <ReasonDialog
          trigger={
            <Button
              type="button"
              variant={active ? 'destructive' : 'outline'}
              className="self-start"
            >
              {active ? p.deactivate : p.reactivate}
            </Button>
          }
          title={
            active ? p.deactivateTitle(person.displayName) : p.reactivateTitle(person.displayName)
          }
          impact={active ? p.deactivateImpact : p.reactivateImpact}
          confirmLabel={active ? p.deactivate : p.reactivate}
          reasonLabel={p.reason}
          reasonHelp={active ? p.reasonHelp : p.reactivateReasonHelp}
          reasonError={p.reasonError}
          destructive={active}
          onCloseAutoFocus={onCloseAutoFocus}
          onConfirm={async (reason) =>
            (
              await run(
                (csrf) => setPersonActive(person.membershipId, !active, reason, csrf),
                active ? p.deactivated : p.reactivated,
                { from: 'reason-dialog' },
              )
            )?.message ?? null
          }
        />
      ) : null}
    </section>
  );
}
