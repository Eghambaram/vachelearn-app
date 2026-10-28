import * as React from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

type InlineAlertProps = {
  tone: 'danger' | 'success';
  children: React.ReactNode;
  className?: string;
};

/**
 * A form's result or error message: text + tone + icon (never colour alone). It can take focus (`tabIndex={-1}`), so a
 * form that replaces itself with a result moves focus here and screen readers read it (WCAG 2.4.3, 4.1.3).
 */
export const InlineAlert = React.forwardRef<HTMLDivElement, InlineAlertProps>(function InlineAlert(
  { tone, children, className },
  ref,
) {
  const Icon = tone === 'danger' ? CircleAlert : CircleCheck;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
        tone === 'danger'
          ? 'border-danger/40 bg-danger-subtle text-danger'
          : 'border-success/40 bg-success-subtle text-success',
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="text-foreground">{children}</div>
    </div>
  );
});

/** Focuses `ref` whenever `key` changes to a truthy value (a result or error appeared). */
export function useFocusOnChange<T extends HTMLElement>(key: unknown) {
  const ref = React.useRef<T>(null);
  React.useEffect(() => {
    if (key) ref.current?.focus();
  }, [key]);
  return ref;
}
