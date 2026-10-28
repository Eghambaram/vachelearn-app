'use client';

import * as React from 'react';
import Link from 'next/link';
import { FormField } from '@/components/form-field';
import { InlineAlert, useFocusOnChange } from '@/components/inline-alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { forgotPassword } from '@/lib/api/auth';
import { getMessages } from '@/lib/i18n';
import { TEXT_LINK } from './login-form';
import { authErrorMessage } from './messages';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/**
 * "Forgot password" (D-087): the confirmation is the same whether or not the address has an account. When the form is
 * replaced by the confirmation, focus moves to it so it is read out.
 */
export function ForgotPasswordForm() {
  const emailRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [emailError, setEmailError] = React.useState<string | undefined>();
  const sentRef = useFocusOnChange<HTMLDivElement>(sent);
  const errorRef = useFocusOnChange<HTMLDivElement>(error);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    setError(null);
    if (!email) {
      setEmailError(t.auth.emailRequired);
      emailRef.current?.focus();
      return;
    }
    setEmailError(undefined);
    setPending(true);
    const result = await forgotPassword({ email });
    setPending(false);
    if (result.ok) setSent(true);
    else setError(authErrorMessage(result));
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <InlineAlert ref={sentRef} tone="success">
          {t.auth.forgotSent}
        </InlineAlert>
        <Link href="/login" className={TEXT_LINK}>
          {t.auth.backToSignIn}
        </Link>
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
      <FormField label={t.auth.email} error={emailError} required>
        {(field) => (
          <Input {...field} ref={emailRef} type="email" name="email" autoComplete="email" />
        )}
      </FormField>
      <Button type="submit" aria-disabled={pending || undefined}>
        {pending ? t.auth.sending : t.auth.forgotAction}
      </Button>
      <Link href="/login" className={TEXT_LINK}>
        {t.auth.backToSignIn}
      </Link>
    </form>
  );
}
