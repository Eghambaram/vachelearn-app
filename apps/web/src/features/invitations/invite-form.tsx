'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TenantRoleKey } from '@vachelearn/contracts';
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
import { createInvitation } from '@/lib/api/invitations';
import { getMessages } from '@/lib/i18n';
import { useApiAction } from '@/lib/use-api-action';
import { invitationErrorMessage } from './messages';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const i = t.invitations;
const WHOLE = 'whole';
// The API validates the address again (and lower-cases it); this only catches typing slips early.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NO_GROUP = 'none';

type FieldName = 'email' | 'role' | 'scope' | 'group';
/** An active group the caller manages (D-122); `branchId` null = whole organisation. */
export type GroupOption = { id: string; name: string; branchId: string | null };

/**
 * Invite a person (Slice 3.1). Offers only what the caller may grant (matrix granting rules): a Tenant Admin any role,
 * a Tenant Admin role for the whole organisation only, a Branch Admin role on a branch only; a Branch Admin offers
 * Learner and Instructor on its own branches. The API applies the same rules and D-115 again.
 */
export function InviteForm({
  roles,
  scopeOptions,
  wholeOrganisation,
  expiryDays,
  groups = [],
}: {
  roles: readonly TenantRoleKey[];
  scopeOptions: readonly { id: string; label: string }[];
  /** Whether the caller may invite for the whole organisation (Tenant Admin). */
  wholeOrganisation: boolean;
  /** The organisation's validity (D-050), when the caller can read the settings. */
  expiryDays: number | null;
  /** Groups the caller may add people to; empty hides the field. */
  groups?: readonly GroupOption[];
}) {
  const router = useRouter();
  const { run, pending, error, statusRef } = useApiAction(invitationErrorMessage);
  const [role, setRole] = React.useState<TenantRoleKey | ''>('');
  const [scope, setScope] = React.useState('');
  const [group, setGroup] = React.useState(NO_GROUP);
  const [errors, setErrors] = React.useState<Partial<Record<FieldName, string>>>({});
  const emailRef = React.useRef<HTMLInputElement>(null);
  const roleRef = React.useRef<HTMLButtonElement>(null);
  const scopeRef = React.useRef<HTMLButtonElement>(null);
  const groupRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => emailRef.current?.focus(), []);

  const scopes = [
    ...(wholeOrganisation && role !== 'branch_admin'
      ? [{ id: WHOLE, label: i.wholeOrganisation }]
      : []),
    ...(role === 'tenant_admin' ? [] : scopeOptions),
  ];
  // D-122: a whole-organisation group, or one on the invited branch.
  const groupChoices = scope
    ? groups.filter((g) => g.branchId === null || (scope !== WHOLE && g.branchId === scope))
    : [];

  function focusFirst(found: Partial<Record<FieldName, string>>) {
    if (found.email) emailRef.current?.focus();
    else if (found.role) roleRef.current?.focus();
    else if (found.scope) scopeRef.current?.focus();
    else if (found.group) groupRef.current?.focus();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    const local: Partial<Record<FieldName, string>> = {
      email: EMAIL.test(email) ? undefined : i.fieldErrors.email,
      role: role ? undefined : i.fieldErrors.role,
      scope: scope && scopes.some((s) => s.id === scope) ? undefined : i.fieldErrors.scope,
    };
    setErrors(local);
    if (Object.values(local).some(Boolean) || !role) {
      focusFirst(local);
      return;
    }
    const failure = await run(
      (csrf) =>
        createInvitation(
          {
            email,
            role,
            branchId: scope === WHOLE ? null : scope,
            groupId: group === NO_GROUP ? null : group,
          },
          csrf,
        ),
      i.sent(email),
      {
        onSuccess: (created) =>
          router.push(`/admin/invitations?sent=${encodeURIComponent(created.email)}`),
      },
    );
    if (failure) {
      const found: Partial<Record<FieldName, string>> = {
        email: failure.fields.includes('email') ? i.fieldErrors.email : undefined,
        role: failure.fields.includes('role') ? i.fieldErrors.role : undefined,
        scope: failure.fields.includes('branchId') ? i.fieldErrors.scope : undefined,
        group: failure.fields.includes('groupId') ? i.fieldErrors.group : undefined,
      };
      setErrors(found);
      focusFirst(found);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {expiryDays ? i.dialogDescription(expiryDays) : i.dialogDescriptionDefault}
      </p>
      {error && !Object.values(errors).some(Boolean) ? (
        <InlineAlert ref={statusRef} tone="danger">
          {error}
        </InlineAlert>
      ) : null}
      <FormField label={i.email} help={i.emailHelp} error={errors.email} required>
        {(field) => (
          <Input
            {...field}
            ref={emailRef}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            maxLength={254}
          />
        )}
      </FormField>
      <FormField label={i.role} error={errors.role} required>
        {(field) => (
          <Select
            value={role}
            onValueChange={(next) => {
              setRole(next as TenantRoleKey);
              setScope('');
              setGroup(NO_GROUP);
            }}
          >
            <SelectTrigger {...field} ref={roleRef} className="w-full">
              <SelectValue placeholder={i.chooseRole} />
            </SelectTrigger>
            <SelectContent>
              {roles.map((key) => (
                <SelectItem key={key} value={key}>
                  {t.roles[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      <FormField
        label={i.scope}
        help={wholeOrganisation ? i.scopeHelpTenant : i.scopeHelpBranch}
        error={errors.scope}
        required
      >
        {(field) => (
          <Select
            value={scope}
            onValueChange={(next) => {
              setScope(next);
              setGroup(NO_GROUP);
            }}
            disabled={!role}
          >
            <SelectTrigger {...field} ref={scopeRef} className="w-full">
              <SelectValue placeholder={i.chooseScope} />
            </SelectTrigger>
            <SelectContent>
              {scopes.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      {groups.length > 0 ? (
        <FormField label={i.group} help={i.groupHelp} error={errors.group}>
          {(field) => (
            <Select value={group} onValueChange={setGroup} disabled={!scope}>
              <SelectTrigger {...field} ref={groupRef} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GROUP}>{i.noGroup}</SelectItem>
                {groupChoices.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" aria-disabled={pending || undefined}>
          {pending ? i.sending : i.send}
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/invitations">{i.close}</Link>
        </Button>
      </div>
    </form>
  );
}
