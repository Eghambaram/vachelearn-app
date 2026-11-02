'use client';

import * as React from 'react';
import type { TenantRoleKey } from '@vachelearn/contracts';
import { FormField } from '@/components/form-field';
import { InlineAlert } from '@/components/inline-alert';
import { ReasonDialog } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { assignRole, revokeRole } from '@/lib/api/people';
import { getMessages } from '@/lib/i18n';
import { useMemberAction } from './use-member-action';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const p = t.people;
const WHOLE = 'whole';

export type RoleRow = {
  /** The assignment id when the caller may revoke it; null for rows shown read-only. */
  assignmentId: string | null;
  key: string;
  role: TenantRoleKey;
  branch: { id: string; code: string; name: string } | null;
};

/**
 * The member's tenant roles (D-053, D-107): listed, revoked with a reason, assigned tenant-wide or on a branch. Only
 * what the caller can do is offered (no dead buttons): the page passes revocable rows, assignable roles and the scopes
 * the granting rules allow (2.4b — a Branch Admin: Learner or Instructor, on the member's own branches it manages).
 * The API applies the rules again.
 */
export function PersonRoles({
  displayName,
  membershipId,
  rows,
  canAssign,
  assignableRoles,
  scopeOptions,
  wholeOrganisation,
  note,
}: {
  displayName: string;
  membershipId: string;
  rows: readonly RoleRow[];
  canAssign: boolean;
  assignableRoles: readonly TenantRoleKey[];
  /** Branches a role may be assigned on. */
  scopeOptions: readonly { id: string; label: string }[];
  /** Whether the caller may assign whole-organisation roles (and add the member to a branch on the way). */
  wholeOrganisation: boolean;
  /** Why changes are not offered (deactivated member, account, load failure), if so. */
  note: string | null;
}) {
  const { run, pending, error, done, statusRef, onCloseAutoFocus } = useMemberAction();
  const [role, setRole] = React.useState<TenantRoleKey | ''>('');
  const [scope, setScope] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<{ role?: string; scope?: string }>({});
  const roleRef = React.useRef<HTMLButtonElement>(null);
  const scopeRef = React.useRef<HTMLButtonElement>(null);

  // Tenant Admin is whole-organisation only; Branch Admin is always on a branch (matrix granting rules).
  const scopes = [
    ...(wholeOrganisation && role !== 'branch_admin'
      ? [{ id: WHOLE, label: p.wholeOrganisationOption }]
      : []),
    ...(role === 'tenant_admin' ? [] : scopeOptions),
  ];

  async function assign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = {
      role: role ? undefined : p.roleRequired,
      scope: scope && scopes.some((s) => s.id === scope) ? undefined : p.scopeRequired,
    };
    setFieldErrors(errors);
    if (errors.role) roleRef.current?.focus();
    else if (errors.scope) scopeRef.current?.focus();
    if (errors.role || errors.scope || !role) return;
    const failure = await run(
      (csrf) => assignRole({ membershipId, role, branchId: scope === WHOLE ? null : scope }, csrf),
      p.assigned,
    );
    if (!failure) {
      setRole('');
      setScope('');
    } else if (failure.field === 'branchId') {
      setFieldErrors({ scope: failure.message });
      scopeRef.current?.focus();
    }
  }

  return (
    <section
      aria-labelledby="person-roles"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="person-roles" className="text-lg font-semibold">
          {p.rolesTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{p.rolesHelp}</p>
      </div>
      {(error && !fieldErrors.scope) || done ? (
        <InlineAlert ref={statusRef} tone={error ? 'danger' : 'success'}>
          {error ?? done}
        </InlineAlert>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{p.rolesEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {rows.map((row) => {
            const scopeName = row.branch ? row.branch.name : p.wholeOrganisation;
            return (
              <li
                key={row.key}
                className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-medium">{t.roles[row.role]}</span>
                  <span className="text-sm break-words text-muted-foreground">{scopeName}</span>
                </span>
                {row.assignmentId ? (
                  <ReasonDialog
                    trigger={
                      <Button type="button" size="sm" variant="outline" className="self-start">
                        {p.revokeShort}
                        <span className="sr-only">
                          {' '}
                          {p.branchContext(`${t.roles[row.role]}, ${scopeName}`)}
                        </span>
                      </Button>
                    }
                    title={p.revokeTitle(t.roles[row.role], scopeName, displayName)}
                    impact={p.revokeImpact}
                    confirmLabel={p.revokeConfirm}
                    reasonLabel={p.reason}
                    reasonHelp={p.reactivateReasonHelp}
                    reasonError={p.reasonError}
                    destructive
                    onCloseAutoFocus={onCloseAutoFocus}
                    onConfirm={async (reason) =>
                      (
                        await run(
                          (csrf) => revokeRole(row.assignmentId!, reason, csrf),
                          p.revoked,
                          { from: 'reason-dialog' },
                        )
                      )?.message ?? null
                    }
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      {canAssign && assignableRoles.length > 0 ? (
        <form
          onSubmit={assign}
          noValidate
          aria-labelledby="person-roles-assign"
          className="flex flex-col gap-3"
        >
          <h3 id="person-roles-assign" className="font-medium">
            {p.assignTitle}
          </h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <FormField label={p.role} error={fieldErrors.role} className="sm:w-56" required>
              {(field) => (
                <Select
                  value={role}
                  onValueChange={(next) => {
                    setRole(next as TenantRoleKey);
                    setScope('');
                  }}
                >
                  <SelectTrigger {...field} ref={roleRef} className="w-full">
                    <SelectValue placeholder={p.chooseRole} />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((key) => (
                      <SelectItem key={key} value={key}>
                        {t.roles[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField
              label={p.scope}
              help={wholeOrganisation ? p.scopeHelpTenant : p.scopeHelpBranch}
              error={fieldErrors.scope}
              className="sm:w-56"
              required
            >
              {(field) => (
                <Select value={scope} onValueChange={setScope} disabled={!role}>
                  <SelectTrigger {...field} ref={scopeRef} className="w-full">
                    <SelectValue placeholder={p.chooseScope} />
                  </SelectTrigger>
                  <SelectContent>
                    {scopes.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <Button type="submit" aria-disabled={pending || undefined}>
              {pending ? p.assigning : p.assign}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
