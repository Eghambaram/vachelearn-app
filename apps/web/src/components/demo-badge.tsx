import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { en } from '@/messages/en';

/** Marks demo/fixture data so it is never mistaken for live figures (CLAUDE.md honesty rules). */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      data-slot="demo-badge"
      title={en.demo.title}
      className={cn(
        'inline-flex h-6 w-fit items-center gap-1 rounded-md border border-warning/40 bg-warning-subtle px-2 text-xs font-medium whitespace-nowrap text-warning',
        className,
      )}
    >
      <FlaskConical aria-hidden="true" className="size-3.5 shrink-0" />
      {en.demo.badge}
      <span className="sr-only"> — {en.demo.title}</span>
    </span>
  );
}
