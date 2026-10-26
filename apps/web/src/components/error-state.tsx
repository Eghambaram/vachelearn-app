import * as React from 'react';
import { CircleAlert, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

type ErrorStateProps = {
  title?: string;
  description?: React.ReactNode;
  /** `error.requestId` from the API error envelope, so support can find the failing request. */
  requestId?: string;
  /** Shown as "Try again" when the failed load can be retried. */
  onRetry?: () => void;
  /** Extra actions, e.g. a server-page retry (`ReloadButton`) and a way back. */
  action?: React.ReactNode;
  headingLevel?: 'h1' | 'h2' | 'h3';
  className?: string;
};

/**
 * A load that failed (network, 5xx). Not for 403 (use PermissionDenied) or validation errors (map onto fields).
 * Never shows raw server messages or stack traces.
 */
export function ErrorState({
  title = t.states.errorTitle,
  description = t.states.errorDescription,
  requestId,
  onRetry,
  action,
  headingLevel: Heading = 'h2',
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      data-slot="error-state"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-danger/30 bg-danger-subtle px-4 py-10 text-center',
        className,
      )}
    >
      <CircleAlert aria-hidden="true" className="size-6 text-danger" />
      <Heading className="text-base font-semibold">{title}</Heading>
      <div className="max-w-md text-sm text-foreground">{description}</div>
      {requestId ? (
        <p className="text-xs text-muted-foreground">
          {t.states.errorReference}: <code className="tabular-nums">{requestId}</code>
        </p>
      ) : null}
      {onRetry ? (
        <Button variant="outline" onClick={onRetry} className="mt-1">
          <RotateCw aria-hidden="true" />
          {t.states.retry}
        </Button>
      ) : null}
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
