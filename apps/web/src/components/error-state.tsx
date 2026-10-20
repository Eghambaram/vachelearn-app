import * as React from 'react';
import { CircleAlert, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { en } from '@/messages/en';

type ErrorStateProps = {
  title?: string;
  description?: React.ReactNode;
  /** `error.requestId` from the API error envelope, so support can find the failing request. */
  requestId?: string;
  /** Shown as "Try again" when the failed load can be retried. */
  onRetry?: () => void;
  headingLevel?: 'h2' | 'h3';
  className?: string;
};

/**
 * A load that failed (network, 5xx). Not for 403 (use PermissionDenied) or validation errors (map onto fields).
 * Never shows raw server messages or stack traces.
 */
export function ErrorState({
  title = en.states.errorTitle,
  description = en.states.errorDescription,
  requestId,
  onRetry,
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
          {en.states.errorReference}: <code className="tabular-nums">{requestId}</code>
        </p>
      ) : null}
      {onRetry ? (
        <Button variant="outline" onClick={onRetry} className="mt-1">
          <RotateCw aria-hidden="true" />
          {en.states.retry}
        </Button>
      ) : null}
    </div>
  );
}
