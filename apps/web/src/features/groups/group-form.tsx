'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { GroupView } from '@vachelearn/contracts';
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
import { Textarea } from '@/components/ui/textarea';
import { createGroup, updateGroup } from '@/lib/api/groups';
import { getMessages } from '@/lib/i18n';
import { useApiAction } from '@/lib/use-api-action';
import { groupErrorMessage } from './messages';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const g = t.groups;

type FieldName = 'name' | 'description' | 'branchId';
/** The scope choice: the whole organisation, or one branch id. */
export const WHOLE_ORGANISATION = 'tenant';
export type ScopeOption = { id: string; label: string };

/**
 * Create a group, or edit its name and description (Slice 3.2, D-119). The scope — whole organisation or one branch —
 * is chosen once at creation and never changes. The API validates everything again; its field errors land on their
 * fields, and edits name the version read (409 → reload, never overwrite).
 */
export function GroupForm({
  group,
  scopes,
  onCancel,
  onSaved,
}: {
  /** Absent: create a new group. */
  group?: GroupView;
  /** For a new group: what the caller may choose (`tenant` first only for tenant-wide callers). */
  scopes?: readonly ScopeOption[];
  onCancel: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { run, pending, error, statusRef } = useApiAction(groupErrorMessage);
  const [scope, setScope] = React.useState<string>(
    scopes && scopes.length === 1 ? scopes[0]!.id : '',
  );
  const [errors, setErrors] = React.useState<Partial<Record<FieldName, string>>>({});
  const scopeId = React.useRef<string | null>(null);
  const refs = {
    name: React.useRef<HTMLInputElement>(null),
    description: React.useRef<HTMLTextAreaElement>(null),
  };

  React.useEffect(() => {
    refs.name.current?.focus();
    // Focus once, when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function focusFirst(found: Partial<Record<FieldName, string>>) {
    if (found.name) refs.name.current?.focus();
    else if (found.description) refs.description.current?.focus();
    else if (found.branchId && scopeId.current) document.getElementById(scopeId.current)?.focus();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    const local: Partial<Record<FieldName, string>> = {
      name: name.length >= 2 && name.length <= 80 ? undefined : g.fieldErrors.name,
      description: description.length <= 500 ? undefined : g.fieldErrors.description,
      branchId: group || scope ? undefined : g.fieldErrors.branchId,
    };
    setErrors(local);
    if (Object.values(local).some(Boolean)) {
      focusFirst(local);
      return;
    }
    const failure = group
      ? await run(
          (csrf) =>
            updateGroup(
              group.id,
              { version: group.version, name, description: description || null },
              csrf,
            ),
          g.saved,
          { onSuccess: () => onSaved?.() },
        )
      : await run(
          (csrf) =>
            createGroup(
              {
                name,
                description: description || null,
                branchId: scope === WHOLE_ORGANISATION ? null : scope,
              },
              csrf,
            ),
          g.created,
          { onSuccess: (created) => router.push(`/admin/groups/${created.id}?created=1`) },
        );
    if (failure) {
      const found: Partial<Record<FieldName, string>> = {};
      for (const field of failure.fields) {
        if (field === 'name')
          found.name =
            failure.fieldCodes.name === 'taken' ? g.errors.nameTaken : g.fieldErrors.name;
        if (field === 'description') found.description = g.fieldErrors.description;
        if (field === 'branchId') found.branchId = g.fieldErrors.branchId;
      }
      setErrors(found);
      focusFirst(found);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-4">
      {error && !Object.values(errors).some(Boolean) ? (
        <InlineAlert ref={statusRef} tone="danger">
          {error}
        </InlineAlert>
      ) : null}
      <FormField label={g.name} help={g.nameHelp} error={errors.name} required>
        {(field) => (
          <Input
            {...field}
            ref={refs.name}
            name="name"
            maxLength={80}
            defaultValue={group?.name ?? ''}
            autoComplete="off"
          />
        )}
      </FormField>
      <FormField label={g.descriptionLabel} help={g.descriptionHelp} error={errors.description}>
        {(field) => (
          <Textarea
            {...field}
            ref={refs.description}
            name="description"
            maxLength={500}
            rows={3}
            defaultValue={group?.description ?? ''}
          />
        )}
      </FormField>
      {group ? null : (
        <FormField label={g.scopeLabel} help={g.scopeHelp} error={errors.branchId} required>
          {(field) => {
            scopeId.current = field.id;
            return (
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger {...field} className="w-full sm:w-80">
                  <SelectValue placeholder={g.chooseScope} />
                </SelectTrigger>
                <SelectContent>
                  {(scopes ?? []).map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          }}
        </FormField>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" aria-disabled={pending || undefined}>
          {group ? (pending ? g.saving : g.save) : pending ? g.creating : g.create}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {g.cancel}
        </Button>
      </div>
    </form>
  );
}

/** The "Create a group" page body: on success the form opens the new group; Cancel goes back to the list. */
export function NewGroup({ scopes }: { scopes: readonly ScopeOption[] }) {
  const router = useRouter();
  return <GroupForm scopes={scopes} onCancel={() => router.push('/admin/groups')} />;
}
