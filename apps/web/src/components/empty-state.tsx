import * as React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { en } from '@/messages/en';

type EmptyStateProps = {
  title?: string;
  /** Say why it is empty and what to do next, e.g. "Assign a course to see learner progress here." */
  description?: React.ReactNode;
  /** A real next step (usually a Button or link), shown only when the viewer may take it. */
  action?: React.ReactNode;
  icon?: React.ReactNode;
  /** Heading level that fits the surrounding outline (h2 on a page, h3 inside a card). */
  headingLevel?: 'h2' | 'h3';
  className?: string;
};

export function EmptyState({
  title = en.states.emptyTitle,
  description,
  action,
  icon = <Inbox />,
  headingLevel: Heading = 'h2',
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-10 text-center',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5"
      >
        {icon}
      </span>
      <Heading className="text-base font-semibold">{title}</Heading>
      {description ? (
        <div className="max-w-md text-sm text-muted-foreground">{description}</div>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
