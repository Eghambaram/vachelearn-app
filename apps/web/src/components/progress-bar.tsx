import { cn } from '@/lib/utils';

/**
 * Determinate progress (integer percent from the server). Named for assistive technology, and the value is also
 * written out in text next to it by callers — never colour or length alone.
 */
export function ProgressBar({
  value,
  label,
  className,
}: {
  value: number;
  /** Accessible name, e.g. "Progress in Fire Safety Refresher". */
  label: string;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${clamped}%` }} />
    </div>
  );
}
