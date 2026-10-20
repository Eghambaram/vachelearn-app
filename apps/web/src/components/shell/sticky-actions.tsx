import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Learner primary actions ("Continue", "Next lesson") that stay reachable on phones: sticky to the bottom below `sm`,
 * padded clear of the home indicator (safe-area inset; root layout sets viewport-fit=cover), inline from `sm` up.
 */
export function StickyActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="sticky-actions"
      className={cn(
        'sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
