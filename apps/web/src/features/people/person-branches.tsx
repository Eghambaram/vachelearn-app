'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { PersonView } from '@vachelearn/contracts';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormField } from '@/components/form-field';
import { InlineAlert } from '@/components/inline-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { addPersonBranch, removePersonBranch, setPrimaryBranch } from '@/lib/api/people';
import { getMessages } from '@/lib/i18n';
import { useMemberAction } from './use-member-action';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const p = t.people;

/**
 * The member's branches (D-026): add, remove, make primary. Branch-scoped viewers see only their own branches, and the
 * primary marker only when they manage all the member's branches (the API decides). Removing is refused while the
 * member holds a live role there (D-104). Action buttons show a short visible verb with the branch appended for
 * screen readers, so rows fit at 360 px and the accessible name still contains the visible text (WCAG 2.5.3, 1.4.10).
 */
export function PersonBranches({
  person,
  manageable,
  branchOptions,
  optionsUnavailable,
  leavesScopeOnRemove,
  inactiveNote,
}: {
  person: PersonView;
  /** `canManage`, `membership.branch.manage` and an active membership; the API re-checks. */
  manageable: boolean;
  /** Active branches the caller can add (already filtered to its scope by the API). */
  branchOptions: readonly { id: string; label: string }[];
  /** The branch list could not be loaded: say so instead of "nothing left to add". */
  optionsUnavailable: boolean;
  /** A branch-scoped caller removing the member's last visible branch can no longer see them afterwards. */
  leavesScopeOnRemove: boolean;
  /** Shown instead of actions when the member is deactivated. */
  inactiveNote: string | null;
}) {
  const router = useRouter();
  const { run, pending, error, done, statusRef, onCloseAutoFocus } = useMemberAction();
  const [toAdd, setToAdd] = React.useState('');
  const [addError, setAddError] = React.useState<string | undefined>();
  const addRef = React.useRef<HTMLButtonElement>(null);
  const addable = branchOptions.filter((b) => !person.branches.some((own) => own.id === b.id));
  const showsPrimary = person.branches.some((b) => b.primary !== undefined);

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!toAdd) {
      setAddError(p.chooseBranch);
      addRef.current?.focus();
      return;
    }
    setAddError(undefined);
    const failure = await run(
      (csrf) => addPersonBranch(person.membershipId, toAdd, csrf),
      p.branchAdded,
    );
    if (!failure) setToAdd('');
  }

  async function remove(branchId: string) {
    const failure = await run(
      (csrf) => removePersonBranch(person.membershipId, branchId, csrf),
      p.branchRemoved,
      { from: 'confirm-dialog' },
    );
    // Out of the caller's branches now: the page would say "not found", so go back to the list and say why.
    if (!failure && leavesScopeOnRemove) router.replace('/admin/users?removed=1');
  }

  return (
    <section
      aria-labelledby="person-branches"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="person-branches" className="text-lg font-semibold">
          {p.branchesTitle}
        </h2>
        {showsPrimary ? <p className="text-sm text-muted-foreground">{p.branchesHelp}</p> : null}
      </div>
      {error || done ? (
        <InlineAlert ref={statusRef} tone={error ? 'danger' : 'success'}>
          {error ?? done}
        </InlineAlert>
      ) : null}
      {person.branches.length === 0 ? (
        <p className="text-sm text-muted-foreground">{p.branchesEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {person.branches.map((branch) => (
            <li
              key={branch.id}
              className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-medium break-words">{branch.name}</span>
                <span className="text-sm text-muted-foreground">{branch.code}</span>
                {branch.primary ? <Badge variant="outline">{p.primary}</Badge> : null}
              </span>
              {manageable ? (
                <span className="flex flex-wrap gap-2">
                  {branch.primary === false ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-disabled={pending || undefined}
                      onClick={() =>
                        void run(
                          (csrf) => setPrimaryBranch(person.membershipId, branch.id, csrf),
                          p.primarySet,
                        )
                      }
                    >
                      {p.makePrimaryShort}
                      <span className="sr-only"> {p.branchContext(branch.name)}</span>
                    </Button>
                  ) : null}
                  <ConfirmDialog
                    trigger={
                      <Button type="button" size="sm" variant="outline">
                        {p.removeShort}
                        <span className="sr-only"> {p.branchContext(branch.name)}</span>
                      </Button>
                    }
                    title={p.removeBranchTitle(person.displayName, branch.name)}
                    impact={p.removeBranchImpact}
                    confirmLabel={p.removeConfirm}
                    destructive
                    onCloseAutoFocus={onCloseAutoFocus}
                    onConfirm={() => remove(branch.id)}
                  />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {inactiveNote ? <p className="text-sm text-muted-foreground">{inactiveNote}</p> : null}
      {manageable ? (
        optionsUnavailable ? (
          <InlineAlert tone="danger">{p.branchesUnavailable}</InlineAlert>
        ) : addable.length === 0 ? (
          <p className="text-sm text-muted-foreground">{p.noMoreBranches}</p>
        ) : (
          <form onSubmit={add} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <FormField label={p.addBranchLabel} error={addError} className="sm:w-64" required>
              {(field) => (
                <Select value={toAdd} onValueChange={setToAdd}>
                  <SelectTrigger {...field} ref={addRef} className="w-full">
                    <SelectValue placeholder={p.chooseBranch} />
                  </SelectTrigger>
                  <SelectContent>
                    {addable.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <Button type="submit" variant="outline" aria-disabled={pending || undefined}>
              {pending ? p.adding : p.addBranch}
            </Button>
          </form>
        )
      ) : null}
    </section>
  );
}
