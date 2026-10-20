import * as React from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

type PermissionDeniedProps = {
  title?: string;
  description?: React.ReactNode;
  /** A safe way out, e.g. a link back to the dashboard. */
  action?: React.ReactNode;
  headingLevel?: 'h1' | 'h2' | 'h3';
  className?: string;
};

/**
 * Shown when the API answers 403. It must not reveal anything about the resource (name, owner, branch). Resources
 * hidden by tenant/branch scope return 404 and show a not-found page instead, so their existence never leaks.
 */
export function PermissionDenied({
  title = t.states.deniedTitle,
  description = t.states.deniedDescription,
  action,
  headingLevel: Heading = 'h2',
  className,
}: PermissionDeniedProps) {
  return (
    <div
      data-slot="permission-denied"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border bg-card px-4 py-10 text-center',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-10 items-center justify-center rounded-full bg-muted text-neutral-700"
      >
        <Lock className="size-5" />
      </span>
      <Heading className="text-base font-semibold">{title}</Heading>
      <div className="max-w-md text-sm text-muted-foreground">{description}</div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
