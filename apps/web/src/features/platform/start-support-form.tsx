'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FormField } from '@/components/form-field';
import { InlineAlert, useFocusOnChange } from '@/components/inline-alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { authErrorMessage } from '@/features/auth/messages';
import { currentSession, startSupportSession } from '@/lib/api/auth';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

type FieldErrors = { tenant?: string; reason?: string };

/** The API's answer → our own copy: field errors on their fields, known conflicts in plain words (UX review 2.4d). */
function startFailure(
  result: Extract<Awaited<ReturnType<typeof startSupportSession>>, { ok: false }>,
): { form?: string; fields: FieldErrors } {
  if (result.status === 422 && result.error.fieldErrors?.length) {
    const fields: FieldErrors = {};
    for (const issue of result.error.fieldErrors) {
      if (issue.field === 'tenantId') fields.tenant = t.shell.supportTenantRequired;
      else if (issue.field === 'reason') fields.reason = t.shell.supportReasonTooShort;
    }
    if (fields.tenant || fields.reason) return { fields };
  }
  if (result.status === 404) return { form: t.shell.supportNotFound, fields: {} };
  if (result.status === 409) {
    return {
      form:
        result.error.code === 'INVALID_STATE' ? t.shell.supportArchived : t.shell.supportConflict,
      fields: {},
    };
  }
  return { form: authErrorMessage(result), fields: {} };
}

/** Open a read-only support session (D-037, D-098): an organisation and a reason the organisation will be able to read. */
export function StartSupportForm({
  tenants,
}: {
  tenants: readonly { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const errorRef = useFocusOnChange<HTMLDivElement>(error);
  const tenantRef = React.useRef<HTMLSelectElement>(null);
  const reasonRef = React.useRef<HTMLTextAreaElement>(null);

  function showFieldErrors(fields: FieldErrors) {
    setFieldErrors(fields);
    if (fields.tenant) tenantRef.current?.focus();
    else if (fields.reason) reasonRef.current?.focus();
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const tenantId = String(form.get('tenant') ?? '');
    const reason = String(form.get('reason') ?? '').trim();
    setError(null);
    const local: FieldErrors = {
      tenant: tenantId ? undefined : t.shell.supportTenantRequired,
      reason: reason.length >= 3 ? undefined : t.shell.supportReasonTooShort,
    };
    if (local.tenant || local.reason) {
      showFieldErrors(local);
      return;
    }
    setFieldErrors({});
    setPending(true);
    const session = await currentSession();
    const result = session.ok
      ? await startSupportSession({ tenantId, reason }, session.data.csrfToken)
      : session;
    if (!result.ok) {
      setPending(false);
      const failure = startFailure(result);
      if (failure.form) setError(failure.form);
      showFieldErrors(failure.fields);
      return;
    }
    // The shell renders the banner on the next render, which takes focus once (SupportBanner).
    router.refresh();
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4" noValidate>
      {error ? (
        <InlineAlert ref={errorRef} tone="danger">
          {error}
        </InlineAlert>
      ) : null}
      <FormField label={t.shell.supportTenant} error={fieldErrors.tenant} required>
        {(field) => (
          <select
            {...field}
            ref={tenantRef}
            name="tenant"
            required
            className="h-10 rounded-lg border border-input bg-card px-3 text-sm text-foreground"
            defaultValue=""
          >
            <option value="" disabled>
              {t.shell.supportChooseTenant}
            </option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField
        label={t.shell.supportReason}
        help={t.shell.supportReasonHelp}
        error={fieldErrors.reason}
        required
      >
        {(field) => <Textarea {...field} ref={reasonRef} name="reason" rows={3} maxLength={500} />}
      </FormField>
      <Button type="submit" aria-disabled={pending || undefined} className="self-start">
        {pending ? t.shell.supportStarting : t.shell.supportStart}
      </Button>
    </form>
  );
}
