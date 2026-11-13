'use client';

import * as React from 'react';
import Link from 'next/link';
import type { InvitationPreview } from '@vachelearn/contracts';
import { passwordProblemMessage } from '@/features/auth/messages';
import { useSignOut } from '@/features/auth/use-sign-out';
import { FormField } from '@/components/form-field';
import { InlineAlert, useFocusOnChange } from '@/components/inline-alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { currentSession } from '@/lib/api/auth';
import {
  acceptInvitation,
  acceptInvitationSignedIn,
  previewInvitation,
} from '@/lib/api/invitations';
import { formatDate } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import { acceptErrorMessage } from './messages';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const a = t.acceptInvite;

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

type View =
  | { kind: 'loading' }
  | { kind: 'problem'; message: string }
  /** A new person: name and password. */
  | { kind: 'new'; preview: InvitationPreview }
  /** An account exists: signed in as it (join), as someone else, or not signed in. */
  | { kind: 'existing'; preview: InvitationPreview; signedInAs: string | null; csrf: string | null }
  | { kind: 'joined'; organisation: string; newAccount: boolean };

/**
 * Accept an invitation (Slice 3.1; D-116). Like the set-password page, the token arrives in the URL fragment, is read
 * once (and again if another link is opened in the same tab) and removed from the address bar; it is only ever posted
 * to the API. A new person chooses a name and password,
 * then signs in (the link never opens a session). An existing account joins while signed in as the invited address.
 * Whenever the view changes to a result, focus moves to it.
 */
export function AcceptInvite() {
  const [token, setToken] = React.useState<string | null>(null);
  const [view, setView] = React.useState<View>({ kind: 'loading' });
  const resultRef = useFocusOnChange<HTMLDivElement>(
    view.kind === 'problem' || view.kind === 'joined' ? view : null,
  );

  React.useEffect(() => {
    // Each read supersedes the previous one: only the latest link's answer is shown.
    let current = 0;
    async function read() {
      const run = ++current;
      const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
      window.history.replaceState(window.history.state, '', window.location.pathname);
      const valid = value && TOKEN.test(value) ? value : null;
      setToken(valid);
      if (!valid) {
        setView({ kind: 'problem', message: a.missing });
        return;
      }
      setView({ kind: 'loading' });
      const preview = await previewInvitation(valid);
      if (run !== current) return;
      if (!preview.ok) {
        setView({ kind: 'problem', message: acceptErrorMessage(preview) });
        return;
      }
      if (!preview.data.accountExists) {
        setView({ kind: 'new', preview: preview.data });
        return;
      }
      const session = await currentSession();
      if (run !== current) return;
      setView({
        kind: 'existing',
        preview: preview.data,
        signedInAs: session.ok ? session.data.user.email : null,
        csrf: session.ok ? session.data.csrfToken : null,
      });
    }
    // The fragment is an external source: read on mount, and again when another link is opened in this tab (a
    // fragment-only navigation does not reload the page).
    void read();
    const onHashChange = () => {
      if (window.location.hash.includes('token=')) void read();
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      current = -1;
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  if (view.kind === 'loading') return <p className="text-sm text-muted-foreground">{a.checking}</p>;

  if (view.kind === 'problem') {
    return (
      <InlineAlert ref={resultRef} tone="danger">
        {view.message}
      </InlineAlert>
    );
  }

  if (view.kind === 'joined') {
    return (
      <div className="flex flex-col gap-4">
        <InlineAlert ref={resultRef} tone="success">
          {view.newAccount ? a.joinedNew(view.organisation) : a.joinedExisting(view.organisation)}
        </InlineAlert>
        <Button asChild className="self-start">
          {view.newAccount ? (
            <Link href="/login">{a.signInToAccept}</Link>
          ) : (
            <Link href="/select-workspace">{a.goToWorkspaces}</Link>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Summary preview={view.preview} />
      {view.kind === 'new' ? (
        <NewAccountForm
          key={token}
          token={token!}
          onJoined={(organisation) => setView({ kind: 'joined', organisation, newAccount: true })}
        />
      ) : (
        <ExistingAccount
          key={token}
          token={token!}
          view={view}
          onJoined={(organisation) => setView({ kind: 'joined', organisation, newAccount: false })}
        />
      )}
    </div>
  );
}

function Summary({ preview }: { preview: InvitationPreview }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="text-base">{a.intro(preview.organisation)}</p>
      <p>{a.as(t.roles[preview.role], preview.branch)}</p>
      <p className="break-all text-muted-foreground">{a.forAddress(preview.email)}</p>
      <p className="text-muted-foreground">{a.expires(formatDate(preview.expiresAt))}</p>
    </div>
  );
}

function NewAccountForm({
  token,
  onJoined,
}: {
  token: string;
  onJoined: (organisation: string) => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<{
    name?: string;
    password?: string;
    confirm?: string;
  }>({});
  const [error, setError] = React.useState<string | null>(null);
  const errorRef = useFocusOnChange<HTMLDivElement>(error);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);
  const confirmRef = React.useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get('name') ?? '').trim();
    const password = String(form.get('new-password') ?? '');
    const confirm = String(form.get('confirm-password') ?? '');
    setError(null);
    const local = {
      name: displayName ? undefined : a.displayNameRequired,
      password: password ? undefined : t.auth.newPasswordRequired,
      confirm: password && password !== confirm ? t.auth.passwordMismatch : undefined,
    };
    setErrors(local);
    if (local.name) return nameRef.current?.focus();
    if (local.password) return passwordRef.current?.focus();
    if (local.confirm) return confirmRef.current?.focus();
    setPending(true);
    const result = await acceptInvitation({ token, displayName, password });
    setPending(false);
    if (result.ok) {
      onJoined(result.data.organisation);
      return;
    }
    const field = result.error.fieldErrors?.[0];
    if (result.status === 422 && field?.field === 'password') {
      setErrors({ password: passwordProblemMessage(field.code) });
      passwordRef.current?.focus();
      return;
    }
    if (result.status === 422 && field?.field === 'displayName') {
      setErrors({ name: a.displayNameInvalid });
      nameRef.current?.focus();
      return;
    }
    setError(acceptErrorMessage(result));
  }

  return (
    <form method="post" onSubmit={submit} noValidate className="flex flex-col gap-4">
      {error ? (
        <InlineAlert ref={errorRef} tone="danger">
          {error}
        </InlineAlert>
      ) : null}
      <FormField label={a.displayName} help={a.displayNameHelp} error={errors.name} required>
        {(field) => (
          <Input {...field} ref={nameRef} name="name" autoComplete="name" maxLength={120} />
        )}
      </FormField>
      <FormField label={a.password} help={t.auth.passwordHelp} error={errors.password} required>
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
      <FormField label={a.confirmPassword} error={errors.confirm} required>
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
        {pending ? a.accepting : a.accept}
      </Button>
    </form>
  );
}

function ExistingAccount({
  token,
  view,
  onJoined,
}: {
  token: string;
  view: Extract<View, { kind: 'existing' }>;
  onJoined: (organisation: string) => void;
}) {
  const { signOut, pending: signingOut, error: signOutError } = useSignOut();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const errorRef = useFocusOnChange<HTMLDivElement>(error ?? signOutError);
  const { preview, signedInAs, csrf } = view;

  if (!signedInAs || !csrf) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">{a.accountExists}</p>
        <Button asChild className="self-start">
          <Link href="/login">{a.signInToAccept}</Link>
        </Button>
      </div>
    );
  }

  if (signedInAs.toLowerCase() !== preview.email.toLowerCase()) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm break-all">{a.signedInAs(signedInAs)}</p>
        <InlineAlert ref={errorRef} tone="danger">
          {signOutError ?? a.wrongAccount}
        </InlineAlert>
        <Button
          type="button"
          variant="outline"
          className="self-start"
          aria-disabled={signingOut || undefined}
          onClick={() => void signOut()}
        >
          {a.signOut}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm break-all">{a.signedInAs(signedInAs)}</p>
      {error ? (
        <InlineAlert ref={errorRef} tone="danger">
          {error}
        </InlineAlert>
      ) : null}
      <Button
        type="button"
        className="self-start"
        aria-disabled={pending || undefined}
        onClick={async () => {
          if (pending) return;
          setPending(true);
          setError(null);
          const result = await acceptInvitationSignedIn(token, csrf);
          setPending(false);
          if (result.ok) onJoined(result.data.organisation);
          else setError(acceptErrorMessage(result));
        }}
      >
        {pending ? a.accepting : a.acceptExisting(preview.organisation)}
      </Button>
    </div>
  );
}
