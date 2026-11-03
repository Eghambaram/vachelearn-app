'use client';

import * as React from 'react';
import type { JobRoleListPage, JobRoleView } from '@vachelearn/contracts';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { InlineAlert } from '@/components/inline-alert';
import { ReasonDialog } from '@/components/reason-dialog';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createJobRole, listJobRoles, renameJobRole, setJobRoleActive } from '@/lib/api/tenancy';
import { formatDate } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import { useApiAction } from '@/lib/use-api-action';
import { jobRoleErrorMessage } from './messages';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const j = t.jobRoles;

/**
 * The organisation's job roles (D-047; UI spec #53; Slice 2.5c): add, rename, deactivate/reactivate with a reason.
 * Read by every role with `tenant_settings.read`; changed by Tenant Admins (`reference_data.manage`). Every change
 * re-renders the first page from the API; rows loaded with "Show more" are patched from the API's answer, so a change
 * on a later page stays visible (UX review 2.5c).
 */
export function JobRoles({ initial, editable }: { initial: JobRoleListPage; editable: boolean }) {
  const { run, pending, error, done, statusRef, onCloseAutoFocus } =
    useApiAction(jobRoleErrorMessage);
  const [more, setMore] = React.useState<JobRoleView[]>([]);
  const [cursor, setCursor] = React.useState(initial.page.nextCursor);
  const [loadError, setLoadError] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [nameError, setNameError] = React.useState<string | undefined>();
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const returnTo = React.useRef<string | null>(null);
  const focusRow = React.useRef<string | null>(null);
  const [shown, setShown] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (renaming !== null || !returnTo.current) return;
    document.querySelector<HTMLButtonElement>(`[data-rename="${returnTo.current}"]`)?.focus();
    returnTo.current = null;
  }, [renaming]);

  // After "Show more": focus the first new row, so keyboard users continue there (the button may be gone).
  React.useEffect(() => {
    if (!focusRow.current) return;
    document.querySelector<HTMLElement>(`[data-job-role="${focusRow.current}"]`)?.focus();
    focusRow.current = null;
  }, [more]);

  const rows = [...initial.data, ...more.filter((r) => !initial.data.some((i) => i.id === r.id))];
  // Until more pages are loaded, the next page follows the (re-rendered) first page.
  const nextCursor = more.length > 0 ? cursor : initial.page.nextCursor;
  const patch = (row: JobRoleView) =>
    setMore((current) => current.map((r) => (r.id === row.id ? row : r)));

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    setLoadError(false);
    const result = await listJobRoles({ cursor: nextCursor, limit: 25 });
    setLoading(false);
    if (!result.ok) {
      setLoadError(true);
      return;
    }
    focusRow.current = result.data.data[0]?.id ?? null;
    setShown(j.moreShown(result.data.data.length));
    setMore((current) => [...current, ...result.data.data]);
    setCursor(result.data.page.nextCursor);
  }

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get('name') ?? '').trim();
    if (name.length < 2 || name.length > 80) {
      setNameError(j.errors.nameInvalid);
      nameRef.current?.focus();
      return;
    }
    setNameError(undefined);
    const failure = await run((csrf) => createJobRole(name, csrf), j.added);
    if (!failure) form.reset();
    else if (failure.field === 'name') {
      setNameError(failure.message);
      nameRef.current?.focus();
    }
  }

  return (
    <section aria-labelledby="job-roles" className="flex max-w-3xl flex-col gap-4">
      <h2 id="job-roles" className="text-lg font-semibold">
        {j.listTitle}
      </h2>
      {(error && !nameError) || done ? (
        <InlineAlert ref={statusRef} tone={error ? 'danger' : 'success'}>
          {error ?? done}
        </InlineAlert>
      ) : null}
      {editable ? (
        <form
          onSubmit={add}
          noValidate
          aria-labelledby="job-roles-add"
          className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-6"
        >
          <h3 id="job-roles-add" className="font-semibold">
            {j.addTitle}
          </h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <FormField
              label={j.name}
              help={j.nameHelp}
              error={nameError}
              required
              className="sm:w-80"
            >
              {(field) => (
                <Input {...field} ref={nameRef} name="name" maxLength={80} autoComplete="off" />
              )}
            </FormField>
            <Button type="submit" aria-disabled={pending || undefined}>
              {pending ? j.adding : j.add}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">{j.readOnlyNote}</p>
      )}
      {rows.length === 0 ? (
        <EmptyState
          headingLevel="h3"
          title={j.emptyTitle}
          description={editable ? j.emptyDescription : j.emptyReadOnly}
        />
      ) : (
        <ul aria-label={j.caption} className="flex flex-col divide-y rounded-xl border bg-card">
          {rows.map((role) =>
            renaming === role.id ? (
              <RenameRow
                key={role.id}
                role={role}
                onDone={(saved) => {
                  // Saved: the section's message takes focus. Cancelled: back to this row's Rename button.
                  if (!saved) returnTo.current = role.id;
                  setRenaming(null);
                }}
                rename={(name) =>
                  run((csrf) => renameJobRole(role.id, role.version, name, csrf), j.renamed, {
                    from: 'inline',
                    onSuccess: patch,
                  })
                }
              />
            ) : (
              <li
                key={role.id}
                data-job-role={role.id}
                tabIndex={-1}
                className="flex flex-col gap-2 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium break-words">{role.name}</span>
                    <StatusBadge entity="jobRole" status={role.status} />
                  </span>
                  {role.deactivatedAt ? (
                    <span className="text-sm break-words text-muted-foreground">
                      {j.deactivatedOn(formatDate(role.deactivatedAt), role.deactivatedReason)}
                    </span>
                  ) : null}
                </span>
                {editable ? (
                  <span className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-rename={role.id}
                      onClick={() => setRenaming(role.id)}
                    >
                      {j.rename}
                      <span className="sr-only"> ({role.name})</span>
                    </Button>
                    <ReasonDialog
                      trigger={
                        <Button type="button" size="sm" variant="outline">
                          {role.status === 'active' ? j.deactivate : j.reactivate}
                          <span className="sr-only"> ({role.name})</span>
                        </Button>
                      }
                      title={
                        role.status === 'active'
                          ? j.deactivateTitle(role.name)
                          : j.reactivateTitle(role.name)
                      }
                      impact={role.status === 'active' ? j.deactivateImpact : j.reactivateImpact}
                      confirmLabel={role.status === 'active' ? j.deactivate : j.reactivate}
                      reasonLabel={j.reason}
                      reasonHelp={j.reasonHelp}
                      reasonError={j.reasonError}
                      destructive={role.status === 'active'}
                      onCloseAutoFocus={onCloseAutoFocus}
                      onConfirm={async (reason) =>
                        (
                          await run(
                            (csrf) =>
                              setJobRoleActive(role.id, role.status !== 'active', reason, csrf),
                            role.status === 'active' ? j.deactivated : j.reactivated,
                            { from: 'reason-dialog', onSuccess: patch },
                          )
                        )?.message ?? null
                      }
                    />
                  </span>
                ) : null}
              </li>
            ),
          )}
        </ul>
      )}
      {loadError ? <InlineAlert tone="danger">{t.states.errorDescription}</InlineAlert> : null}
      {shown ? (
        <p role="status" className="sr-only">
          {shown}
        </p>
      ) : null}
      {nextCursor ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          aria-disabled={loading || undefined}
          onClick={() => void loadMore()}
        >
          {loading ? t.common.loading : j.loadMore}
        </Button>
      ) : null}
    </section>
  );
}

/** One row being renamed: an inline form, focused on open; Escape or Cancel closes it and returns focus. */
function RenameRow({
  role,
  rename,
  onDone,
}: {
  role: JobRoleView;
  rename: (name: string) => Promise<{ message: string; field?: string } | null>;
  /** `saved`: the rename went through. */
  onDone: (saved: boolean) => void;
}) {
  const [error, setError] = React.useState<string | undefined>();
  const [pending, setPending] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
    if (name.length < 2 || name.length > 80) {
      setError(j.errors.nameInvalid);
      inputRef.current?.focus();
      return;
    }
    if (name === role.name) {
      onDone(false);
      return;
    }
    setPending(true);
    const failure = await rename(name);
    setPending(false);
    if (!failure) onDone(true);
    else {
      setError(failure.message);
      inputRef.current?.focus();
    }
  }

  return (
    <li className="px-4 py-3">
      <form
        onSubmit={submit}
        noValidate
        onKeyDown={(event) => {
          if (event.key === 'Escape') onDone(false);
        }}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <FormField label={j.renameTitle(role.name)} error={error} required className="sm:w-80">
          {(field) => (
            <Input
              {...field}
              ref={inputRef}
              name="name"
              maxLength={80}
              defaultValue={role.name}
              autoComplete="off"
            />
          )}
        </FormField>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" aria-disabled={pending || undefined}>
            {j.saveName}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onDone(false)}>
            {t.common.cancel}
          </Button>
        </div>
      </form>
    </li>
  );
}
