'use client';

import { InlineAlert, useFocusOnChange } from '@/components/inline-alert';

/**
 * A success message for a change made on the previous page (e.g. "Branch added." after creating one): shown and focused
 * on arrival, so the result is announced although the form that made it is gone (WCAG 2.4.3, 4.1.3).
 */
export function FocusedNotice({ message }: { message: string }) {
  const ref = useFocusOnChange<HTMLDivElement>(true);
  return (
    <InlineAlert ref={ref} tone="success" className="max-w-2xl">
      {message}
    </InlineAlert>
  );
}
