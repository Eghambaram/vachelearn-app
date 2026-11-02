'use client';

import * as React from 'react';
import type { PersonView } from '@vachelearn/contracts';
import { FormField } from '@/components/form-field';
import { InlineAlert } from '@/components/inline-alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updatePerson } from '@/lib/api/people';
import { getMessages } from '@/lib/i18n';
import { useMemberAction } from './use-member-action';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const p = t.people;
const NONE = 'none';

/**
 * The organisation's fields of a member (D-047): employee ID, department, job role. Never the account's name (D-105).
 * Edits name the version read; a 409 asks to reload rather than overwrite someone else's change.
 */
export function PersonProfile({
  person,
  editable,
  jobRoles,
}: {
  person: PersonView;
  /** `canManage` and `user.update`; the API re-checks. */
  editable: boolean;
  /** Active job roles to choose from. */
  jobRoles: readonly { id: string; label: string }[];
}) {
  const [editing, setEditing] = React.useState(false);
  const { run, pending, error, done, statusRef, clear } = useMemberAction();
  const editButtonRef = React.useRef<HTMLButtonElement>(null);
  const firstFieldRef = React.useRef<HTMLInputElement>(null);
  const jobRoleRef = React.useRef<HTMLButtonElement>(null);
  const [jobRoleId, setJobRoleId] = React.useState(person.jobRole?.id ?? NONE);
  const [fieldErrors, setFieldErrors] = React.useState<{ employeeId?: string; jobRoleId?: string }>(
    {},
  );
  const wasEditing = React.useRef(false);

  // Into the form: its first field. Out of it (cancel): back to "Edit details", unless a message took focus.
  React.useEffect(() => {
    if (editing) firstFieldRef.current?.focus();
    else if (wasEditing.current && !done && !error) editButtonRef.current?.focus();
    wasEditing.current = editing;
  }, [editing, done, error]);

  // The current role stays choosable even when inactive (it is already theirs); others only if active.
  const options =
    person.jobRole && !jobRoles.some((r) => r.id === person.jobRole!.id)
      ? [{ id: person.jobRole.id, label: p.jobRoleInactive(person.jobRole.name) }, ...jobRoles]
      : jobRoles;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = String(form.get(name) ?? '').trim();
      return value === '' ? null : value;
    };
    const body = {
      version: person.version,
      employeeId: text('employeeId'),
      department: text('department'),
      jobRoleId: jobRoleId === NONE ? null : jobRoleId,
    };
    setFieldErrors({});
    const failure = await run((csrf) => updatePerson(person.membershipId, body, csrf), p.saved);
    if (!failure) {
      setEditing(false);
      return;
    }
    // Validation refusals go on their field (web rules: 422 → fieldErrors), focused.
    if (failure.field === 'employeeId') {
      setFieldErrors({ employeeId: failure.message });
      firstFieldRef.current?.focus();
    } else if (failure.field === 'jobRoleId') {
      setFieldErrors({ jobRoleId: failure.message });
      jobRoleRef.current?.focus();
    }
  }

  return (
    <section
      aria-labelledby="person-profile"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 id="person-profile" className="text-lg font-semibold">
            {p.profileTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{p.profileHelp}</p>
        </div>
        {editable && !editing ? (
          <Button
            ref={editButtonRef}
            type="button"
            variant="outline"
            onClick={() => {
              clear();
              setEditing(true);
            }}
          >
            {p.edit}
          </Button>
        ) : null}
      </div>
      {(error && !fieldErrors.employeeId && !fieldErrors.jobRoleId) || done ? (
        <InlineAlert ref={statusRef} tone={error ? 'danger' : 'success'}>
          {error ?? done}
        </InlineAlert>
      ) : null}
      {editing ? (
        <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-4">
          <FormField label={p.employeeId} help={p.employeeIdHelp} error={fieldErrors.employeeId}>
            {(field) => (
              <Input
                {...field}
                ref={firstFieldRef}
                name="employeeId"
                maxLength={40}
                defaultValue={person.employeeId ?? ''}
                autoComplete="off"
              />
            )}
          </FormField>
          <FormField label={p.department} help={p.departmentHelp}>
            {(field) => (
              <Input
                {...field}
                name="department"
                maxLength={100}
                defaultValue={person.department ?? ''}
                autoComplete="off"
              />
            )}
          </FormField>
          <FormField label={p.jobRole} error={fieldErrors.jobRoleId}>
            {(field) => (
              <Select value={jobRoleId} onValueChange={setJobRoleId}>
                <SelectTrigger {...field} ref={jobRoleRef} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{p.jobRoleNone}</SelectItem>
                  {options.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" aria-disabled={pending || undefined}>
              {pending ? p.saving : p.save}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                clear();
                setFieldErrors({});
                setJobRoleId(person.jobRole?.id ?? NONE);
                setEditing(false);
              }}
            >
              {p.cancelEdit}
            </Button>
          </div>
        </form>
      ) : (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
          <dt className="text-sm text-muted-foreground">{p.employeeId}</dt>
          <dd>{person.employeeId ?? <span className="text-muted-foreground">{p.none}</span>}</dd>
          <dt className="text-sm text-muted-foreground">{p.department}</dt>
          <dd>{person.department ?? <span className="text-muted-foreground">{p.none}</span>}</dd>
          <dt className="text-sm text-muted-foreground">{p.jobRole}</dt>
          <dd>
            {person.jobRole ? (
              person.jobRole.status === 'active' ? (
                person.jobRole.name
              ) : (
                p.jobRoleInactive(person.jobRole.name)
              )
            ) : (
              <span className="text-muted-foreground">{p.none}</span>
            )}
          </dd>
        </dl>
      )}
    </section>
  );
}
