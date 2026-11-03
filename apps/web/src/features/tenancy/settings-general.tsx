'use client';

import * as React from 'react';
import type { TenantSettingsView } from '@vachelearn/contracts';
import { FormField } from '@/components/form-field';
import { InlineAlert } from '@/components/inline-alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateTenantSettings } from '@/lib/api/tenancy';
import { getMessages } from '@/lib/i18n';
import { useApiAction } from '@/lib/use-api-action';
import { fieldMessages, settingsErrorMessage } from './messages';
import { TimezoneField } from './timezone-field';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const s = t.settings;

type FieldName = 'displayName' | 'defaultTimezone' | 'defaultLocale';

/**
 * General settings of the caller's organisation (UI spec #30; Slice 2.5c): name, default time zone, language tag. The
 * web address name (slug) is fixed (D-079). Edits name the version read; 409 asks to reload.
 */
export function SettingsGeneral({
  settings,
  editable,
}: {
  settings: TenantSettingsView;
  /** `tenant_settings.update`; the API re-checks. */
  editable: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const { run, pending, error, done, statusRef, clear } = useApiAction(settingsErrorMessage);
  const [timezone, setTimezone] = React.useState<string | null>(settings.defaultTimezone);
  const [errors, setErrors] = React.useState<Partial<Record<FieldName, string>>>({});
  const editRef = React.useRef<HTMLButtonElement>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const localeRef = React.useRef<HTMLInputElement>(null);
  const timezoneId = React.useRef<string | null>(null);
  const wasEditing = React.useRef(false);

  React.useEffect(() => {
    if (editing) nameRef.current?.focus();
    else if (wasEditing.current && !done && !error) editRef.current?.focus();
    wasEditing.current = editing;
  }, [editing, done, error]);

  function focusFirst(found: Partial<Record<FieldName, string>>) {
    if (found.displayName) nameRef.current?.focus();
    else if (found.defaultTimezone && timezoneId.current)
      document.getElementById(timezoneId.current)?.focus();
    else if (found.defaultLocale) localeRef.current?.focus();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get('displayName') ?? '').trim();
    const defaultLocale = String(form.get('defaultLocale') ?? '').trim();
    const local: Partial<Record<FieldName, string>> = {
      displayName: displayName.length >= 2 ? undefined : s.fieldErrors.displayName,
      defaultTimezone: timezone ? undefined : s.fieldErrors.defaultTimezone,
      defaultLocale: defaultLocale ? undefined : s.fieldErrors.defaultLocale,
    };
    setErrors(local);
    if (Object.values(local).some(Boolean)) {
      focusFirst(local);
      return;
    }
    const failure = await run(
      (csrf) =>
        updateTenantSettings(
          { version: settings.version, displayName, defaultTimezone: timezone!, defaultLocale },
          csrf,
        ),
      s.saved,
    );
    if (!failure) {
      setEditing(false);
      return;
    }
    const found = fieldMessages(failure.fields, s.fieldErrors);
    setErrors(found);
    focusFirst(found);
  }

  return (
    <section
      aria-labelledby="settings-general"
      className="flex max-w-3xl flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="settings-general" className="text-lg font-semibold">
          {s.generalTitle}
        </h2>
        {editable && !editing ? (
          <Button
            ref={editRef}
            type="button"
            variant="outline"
            onClick={() => {
              clear();
              setErrors({});
              setTimezone(settings.defaultTimezone);
              setEditing(true);
            }}
          >
            {s.edit}
          </Button>
        ) : null}
      </div>
      {(error && !Object.values(errors).some(Boolean)) || done ? (
        <InlineAlert ref={statusRef} tone={error ? 'danger' : 'success'}>
          {error ?? done}
        </InlineAlert>
      ) : null}
      {editing ? (
        <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-4">
          <FormField
            label={s.displayName}
            help={s.displayNameHelp}
            error={errors.displayName}
            required
          >
            {(field) => (
              <Input
                {...field}
                ref={nameRef}
                name="displayName"
                maxLength={120}
                defaultValue={settings.displayName}
                autoComplete="organization"
              />
            )}
          </FormField>
          <FormField
            label={s.defaultTimezone}
            help={s.defaultTimezoneHelp}
            error={errors.defaultTimezone}
            required
          >
            {(field) => (
              <TimezoneField
                field={field}
                onId={(id) => (timezoneId.current = id)}
                value={timezone}
                onValueChange={setTimezone}
                placeholder={t.branches.chooseTimezone}
              />
            )}
          </FormField>
          <FormField
            label={s.defaultLocale}
            help={s.defaultLocaleHelp}
            error={errors.defaultLocale}
            required
            className="sm:w-64"
          >
            {(field) => (
              <Input
                {...field}
                ref={localeRef}
                name="defaultLocale"
                maxLength={35}
                defaultValue={settings.defaultLocale}
                autoComplete="off"
              />
            )}
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" aria-disabled={pending || undefined}>
              {pending ? s.saving : s.save}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                clear();
                setErrors({});
                setEditing(false);
              }}
            >
              {s.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
          <dt className="text-sm text-muted-foreground">{s.displayName}</dt>
          <dd className="break-words">{settings.displayName}</dd>
          <dt className="text-sm text-muted-foreground">{s.slug}</dt>
          <dd>
            {settings.slug}
            <span className="block text-sm text-muted-foreground">{s.slugHelp}</span>
          </dd>
          <dt className="text-sm text-muted-foreground">{s.defaultTimezone}</dt>
          <dd>{settings.defaultTimezone.replaceAll('_', ' ')}</dd>
          <dt className="text-sm text-muted-foreground">{s.defaultLocale}</dt>
          <dd>{settings.defaultLocale}</dd>
        </dl>
      )}
    </section>
  );
}
