'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormField } from '@/components/form-field';
import { InlineAlert } from '@/components/inline-alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { login } from '@/lib/api/auth';
import { getMessages } from '@/lib/i18n';
import { authErrorMessage } from './messages';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const TEXT_LINK =
  'inline-flex min-h-6 items-center self-start text-sm text-primary underline-offset-4 hover:underline';

/**
 * Sign-in (D-010). The API answers every failure the same way, so the form shows one message, not which field was
 * wrong. Values are read from the form at submit (browser autofill counts even before any typing); the button stays
 * enabled so keyboard users can reach it, and repeat submissions are ignored while one is pending. After a failure the
 * password field is cleared and focused. On success the HttpOnly cookie is set by the response; `/welcome` reads it.
 */
export function LoginForm() {
  const router = useRouter();
  const passwordRef = React.useRef<HTMLInputElement>(null);
  const emailRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<{ email?: string; password?: string }>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const missing = {
      ...(email ? {} : { email: t.auth.emailRequired }),
      ...(password ? {} : { password: t.auth.passwordRequired }),
    };
    setFieldErrors(missing);
    setError(null);
    if (missing.email || missing.password) {
      (missing.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setPending(true);
    const result = await login({ email, password });
    if (result.ok) {
      router.replace('/welcome');
      router.refresh();
      return;
    }
    setPending(false);
    if (passwordRef.current) passwordRef.current.value = '';
    setError(authErrorMessage(result));
    passwordRef.current?.focus();
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      <FormField label={t.auth.email} error={fieldErrors.email} required>
        {(field) => (
          <Input {...field} ref={emailRef} type="email" name="email" autoComplete="username" />
        )}
      </FormField>
      <FormField label={t.auth.password} error={fieldErrors.password} required>
        {(field) => (
          <Input
            {...field}
            ref={passwordRef}
            type="password"
            name="password"
            autoComplete="current-password"
          />
        )}
      </FormField>
      <Button type="submit" aria-disabled={pending || undefined}>
        {pending ? t.auth.signingIn : t.auth.signInAction}
      </Button>
      <Link href="/forgot-password" className={TEXT_LINK}>
        {t.auth.forgotLink}
      </Link>
    </form>
  );
}
