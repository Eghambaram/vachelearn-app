'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check } from 'lucide-react';
import { InlineAlert, useFocusOnChange } from '@/components/inline-alert';
import { currentSession, switchTenant } from '@/lib/api/auth';
import { getMessages } from '@/lib/i18n';
import { authErrorMessage } from './messages';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/**
 * The user's organisations (D-089): switching is an API call that checks the membership server-side; afterwards the
 * shell starts again at the workspace home, so no page from the previous organisation survives the switch.
 */
export function TenantSwitchList({
  memberships,
  activeTenantId,
}: {
  memberships: readonly { membershipId?: string; tenantId: string; tenantName: string }[];
  activeTenantId: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const errorRef = useFocusOnChange<HTMLDivElement>(error);

  async function choose(membershipId: string) {
    if (pending) return;
    setPending(membershipId);
    setError(null);
    const session = await currentSession();
    const result = session.ok ? await switchTenant(membershipId, session.data.csrfToken) : session;
    if (!result.ok) {
      setPending(null);
      setError(authErrorMessage(result));
      return;
    }
    router.replace('/welcome');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <InlineAlert ref={errorRef} tone="danger">
          {error}
        </InlineAlert>
      ) : null}
      <ul className="flex flex-col gap-2">
        {memberships.map((m) => {
          const current = m.tenantId === activeTenantId;
          return (
            <li key={m.tenantId}>
              <button
                type="button"
                onClick={() =>
                  m.membershipId && !current ? void choose(m.membershipId) : undefined
                }
                aria-current={current ? 'true' : undefined}
                aria-disabled={current || pending !== null || undefined}
                className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium hover:bg-muted"
              >
                <span>{m.tenantName}</span>
                {current ? (
                  // Visible text, not only a tick (UX review 2.4d).
                  <span className="flex items-center gap-1 text-xs font-medium text-primary">
                    <Check aria-hidden="true" className="size-4" />
                    {t.shell.currentLabel}
                  </span>
                ) : pending === m.membershipId ? (
                  <span className="text-xs text-muted-foreground">{t.shell.switching}</span>
                ) : (
                  <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
