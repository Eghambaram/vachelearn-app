'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LifeBuoy } from 'lucide-react';
import { InlineAlert, useFocusOnChange } from '@/components/inline-alert';
import { Button } from '@/components/ui/button';
import { authErrorMessage } from '@/features/auth/messages';
import { currentSession, endSupportSession } from '@/lib/api/auth';
import { formatDateTime } from '@/lib/format';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/**
 * Always-visible banner while platform staff are inside a support session (D-037): which tenant, that it is read-only
 * and recorded, when it ends, and a way out. Ending fetches a fresh CSRF token; only success leaves support mode.
 */
export function SupportBanner({
  support,
}: {
  support: { sessionId: string; tenantName: string; expiresAt: string };
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const errorRef = useFocusOnChange<HTMLDivElement>(error);
  const bannerRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  // Focus moves here once per support session, when it starts, so keyboard and screen-reader users learn they are in
  // support mode (UX review 2.4d). Per-viewer convenience only: without storage the banner simply takes focus again.
  React.useEffect(() => {
    const key = `vl-support-announced:${support.sessionId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch {
      // Storage blocked: announce anyway.
    }
    bannerRef.current?.focus();
  }, [support.sessionId]);

  async function end() {
    if (pending) return;
    setPending(true);
    setError(null);
    const session = await currentSession();
    const result = session.ok
      ? await endSupportSession(support.sessionId, session.data.csrfToken)
      : session;
    // Already over (ended elsewhere, expired: 404) counts as ended; anything else stays here with the error.
    if (!result.ok && result.status !== 404 && result.status !== 401) {
      setPending(false);
      setError(authErrorMessage(result));
      return;
    }
    router.replace('/platform/support?ended=1');
    router.refresh();
  }

  return (
    <div
      ref={bannerRef}
      role="region"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="flex flex-col gap-2 border-b border-warning/40 bg-warning-subtle px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-6"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p id={titleId} className="flex items-center gap-2 font-medium text-warning">
          <LifeBuoy aria-hidden="true" className="size-4 shrink-0" />
          {t.shell.supportBanner(support.tenantName)}
        </p>
        <p className="text-foreground">{t.shell.supportReadOnly}</p>
        <p className="text-muted-foreground">
          {t.shell.supportEndsAt(formatDateTime(support.expiresAt))}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={end}
          aria-disabled={pending || undefined}
          className="ml-auto"
        >
          {pending ? t.shell.supportEnding : t.shell.supportEnd}
        </Button>
      </div>
      {error ? (
        <InlineAlert ref={errorRef} tone="danger">
          {error}
        </InlineAlert>
      ) : null}
    </div>
  );
}
