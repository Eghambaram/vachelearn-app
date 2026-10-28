'use client';

import * as React from 'react';
import Link from 'next/link';
import { FormField } from '@/components/form-field';
import { InlineAlert, useFocusOnChange } from '@/components/inline-alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setPassword } from '@/lib/api/auth';
import { getMessages } from '@/lib/i18n';
import { authErrorMessage, passwordProblemMessage } from './messages';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

type View =
  | { kind: 'loading' }
  | { kind: 'form' }
  | { kind: 'saved' }
  | { kind: 'link-problem'; missing: boolean };

/**
 * Set or reset a password from an emailed link (D-083, D-087). The token arrives in the URL fragment, which the
 * browser never sends to a server; it is read once and removed from the address bar and this tab's session history.
 * The browser's global history may still hold the link as first opened: single use and expiry are the controls. The
 * policy is checked by the API (field errors, focused). Whenever the form gives way to a result, focus moves to it.
 */
export function SetPasswordForm({ purpose }: { purpose: 'set' | 'reset' }) {
  const [token, setToken] = React.useState<string | null>(null);
  const [view, setView] = React.useState<View>({ kind: 'loading' });
  const [pending, setPending] = React.useState(false);
  const [fieldError, setFieldError] = React.useState<string | undefined>();
  const [confirmError, setConfirmError] = React.useState<string | undefined>();
  const [error, setError] = React.useState<string | null>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);
  const confirmRef = React.useRef<HTMLInputElement>(null);
  const resultRef = useFocusOnChange<HTMLDivElement>(
    view.kind === 'form' || view.kind === 'loading' ? null : view,
  );
  const errorRef = useFocusOnChange<HTMLDivElement>(error);

  React.useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
    // Keep the router's own history state (only the URL changes), so Back/Forward and later router updates behave
    // normally and never write the fragment back.
    window.history.replaceState(window.history.state, '', window.location.pathname);
    const valid = value && TOKEN.test(value) ? value : null;
    // Read once on mount from the URL fragment (an external source), so it is set here, not during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(valid);
    setView(valid ? { kind: 'form' } : { kind: 'link-problem', missing: true });
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !token) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get('new-password') ?? '');
    const confirm = String(form.get('confirm-password') ?? '');
    setError(null);
    if (!password) {
      setFieldError(t.auth.newPasswordRequired);
      setConfirmError(undefined);
      passwordRef.current?.focus();
      return;
    }
    setFieldError(undefined);
    if (password !== confirm) {
      setConfirmError(t.auth.passwordMismatch);
      confirmRef.current?.focus();
      return;
    }
    setConfirmError(undefined);
    setPending(true);
    const result = await setPassword({ token, password });
    setPending(false);
    if (result.ok) {
      setView({ kind: 'saved' });
      return;
    }
    const problem = result.error.fieldErrors?.find((f) => f.field === 'password');
    if (result.status === 422 && problem) {
      setFieldError(passwordProblemMessage(problem.code));
      passwordRef.current?.focus();
      return;
    }
    if (result.error.code === 'INVALID_LINK') {
      setView({ kind: 'link-problem', missing: false });
      return;
    }
    setError(authErrorMessage(result));
  }

  if (view.kind === 'loading')
    return <p className="text-sm text-muted-foreground">{t.common.loading}</p>;

  if (view.kind === 'saved') {
    return (
      <div className="flex flex-col gap-4">
        <InlineAlert ref={resultRef} tone="success">
          {purpose === 'reset' ? t.auth.passwordResetDone : t.auth.passwordSaved}
        </InlineAlert>
        <Button asChild className="self-start">
          <Link href="/login">{t.auth.signInAction}</Link>
        </Button>
      </div>
    );
  }

  if (view.kind === 'link-problem') {
    return (
      <div className="flex flex-col gap-4">
        <InlineAlert ref={resultRef} tone="danger">
          {view.missing ? t.auth.linkMissing : t.auth.linkInvalid}
        </InlineAlert>
        <Button asChild variant="outline" className="self-start">
          <Link href="/forgot-password">{t.auth.requestNewLink}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error ? (
        <InlineAlert ref={errorRef} tone="danger">
          {error}
        </InlineAlert>
      ) : null}
      <FormField label={t.auth.newPassword} help={t.auth.passwordHelp} error={fieldError} required>
        {(field) => (
          <Input
            {...field}
            ref={passwordRef}
            type="password"
            name="new-password"
            autoComplete="new-password"
          />
        )}
      </FormField>
      <FormField label={t.auth.confirmPassword} error={confirmError} required>
        {(field) => (
          <Input
            {...field}
            ref={confirmRef}
            type="password"
            name="confirm-password"
            autoComplete="new-password"
          />
        )}
      </FormField>
      <Button type="submit" aria-disabled={pending || undefined}>
        {pending ? t.auth.saving : t.auth.savePassword}
      </Button>
    </form>
  );
}
