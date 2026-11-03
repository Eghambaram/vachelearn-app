'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { BranchView } from '@vachelearn/contracts';
import { FormField } from '@/components/form-field';
import { InlineAlert } from '@/components/inline-alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createBranch, updateBranch } from '@/lib/api/tenancy';
import { getMessages } from '@/lib/i18n';
import { useApiAction } from '@/lib/use-api-action';
import { branchErrorMessage, fieldMessages } from './messages';
import { TimezoneField } from './timezone-field';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const b = t.branches;

type FieldName = 'code' | 'name' | 'timezone' | 'countryCode';

/**
 * Add a branch, or edit one (UI spec #16; API from 2.2). The code is fixed once created and unique in the
 * organisation; the API validates everything again and its field errors land on their fields. Edits name the version
 * read (409 → reload, never overwrite).
 */
export function BranchForm({
  branch,
  defaultTimezone,
  onCancel,
  onSaved,
}: {
  /** Absent: add a new branch. */
  branch?: BranchView;
  /** The organisation's default, preselected for a new branch. */
  defaultTimezone?: string;
  onCancel: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { run, pending, error, statusRef } = useApiAction(branchErrorMessage);
  const [timezone, setTimezone] = React.useState<string | null>(
    branch?.timezone ?? defaultTimezone ?? null,
  );
  const [errors, setErrors] = React.useState<Partial<Record<FieldName, string>>>({});
  // FormField generates the control's id; kept here so a time zone error can move focus to its combobox.
  const timezoneId = React.useRef<string | null>(null);
  const refs = {
    code: React.useRef<HTMLInputElement>(null),
    name: React.useRef<HTMLInputElement>(null),
    countryCode: React.useRef<HTMLInputElement>(null),
  };

  React.useEffect(() => {
    (branch ? refs.name : refs.code).current?.focus();
    // Focus once, when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function focusFirst(found: Partial<Record<FieldName, string>>) {
    for (const key of ['code', 'name', 'timezone', 'countryCode'] as const) {
      if (!found[key]) continue;
      if (key === 'timezone') {
        if (timezoneId.current) document.getElementById(timezoneId.current)?.focus();
      } else refs[key].current?.focus();
      return;
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const optional = (name: string) => text(name) || null;
    const local: Partial<Record<FieldName, string>> = {
      code:
        branch || /^[A-Za-z0-9][A-Za-z0-9-]{1,19}$/.test(text('code'))
          ? undefined
          : b.fieldErrors.code,
      name: text('name').length >= 2 ? undefined : b.fieldErrors.name,
      timezone: timezone ? undefined : b.fieldErrors.timezone,
      countryCode:
        !text('countryCode') || /^[A-Za-z]{2}$/.test(text('countryCode'))
          ? undefined
          : b.fieldErrors.countryCode,
    };
    setErrors(local);
    if (Object.values(local).some(Boolean)) {
      focusFirst(local);
      return;
    }
    const fields = {
      name: text('name'),
      timezone: timezone!,
      addressLine: optional('addressLine'),
      city: optional('city'),
      region: optional('region'),
      countryCode: optional('countryCode'),
    };
    const failure = branch
      ? await run(
          (csrf) => updateBranch(branch.id, { version: branch.version, ...fields }, csrf),
          b.saved,
          {
            onSuccess: () => onSaved?.(),
          },
        )
      : await run((csrf) => createBranch({ code: text('code'), ...fields }, csrf), b.saved, {
          // The new branch's page says "Branch added." and takes focus there (UX review 2.5c).
          onSuccess: (created) => router.push(`/admin/branches/${created.id}?created=1`),
        });
    if (failure) {
      const found = fieldMessages(failure.fields, {
        ...b.fieldErrors,
        code: failure.fieldCodes.code === 'taken' ? b.errors.codeTaken : b.fieldErrors.code,
      });
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
      {branch ? null : (
        <FormField label={b.code} help={b.codeHelp} error={errors.code} required>
          {(field) => (
            <Input
              {...field}
              ref={refs.code}
              name="code"
              maxLength={20}
              autoComplete="off"
              className="uppercase"
            />
          )}
        </FormField>
      )}
      <FormField label={b.name} error={errors.name} required>
        {(field) => (
          <Input
            {...field}
            ref={refs.name}
            name="name"
            maxLength={120}
            defaultValue={branch?.name ?? ''}
            autoComplete="off"
          />
        )}
      </FormField>
      <FormField label={b.timezone} help={b.timezoneHelp} error={errors.timezone} required>
        {(field) => (
          <TimezoneField
            field={field}
            onId={(id) => (timezoneId.current = id)}
            value={timezone}
            onValueChange={setTimezone}
            placeholder={b.chooseTimezone}
          />
        )}
      </FormField>
      <FormField label={b.addressLine}>
        {(field) => (
          <Input
            {...field}
            name="addressLine"
            maxLength={200}
            defaultValue={branch?.addressLine ?? ''}
            autoComplete="street-address"
          />
        )}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={b.city}>
          {(field) => (
            <Input
              {...field}
              name="city"
              maxLength={100}
              defaultValue={branch?.city ?? ''}
              autoComplete="address-level2"
            />
          )}
        </FormField>
        <FormField label={b.region}>
          {(field) => (
            <Input
              {...field}
              name="region"
              maxLength={100}
              defaultValue={branch?.region ?? ''}
              autoComplete="address-level1"
            />
          )}
        </FormField>
      </div>
      <FormField
        label={b.countryCode}
        help={b.countryCodeHelp}
        error={errors.countryCode}
        className="sm:w-48"
      >
        {(field) => (
          <Input
            {...field}
            ref={refs.countryCode}
            name="countryCode"
            maxLength={2}
            defaultValue={branch?.countryCode ?? ''}
            autoComplete="country"
            className="uppercase"
          />
        )}
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" aria-disabled={pending || undefined}>
          {branch ? (pending ? b.saving : b.save) : pending ? b.creating : b.create}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {b.cancel}
        </Button>
      </div>
    </form>
  );
}
