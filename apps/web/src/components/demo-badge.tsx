import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/** Marks demo/fixture data so it is never mistaken for live figures (CLAUDE.md honesty rules). */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      data-slot="demo-badge"
      title={t.demo.title}
      className={cn(
        'inline-flex h-6 w-fit items-center gap-1 rounded-md border border-warning/40 bg-warning-subtle px-2 text-xs font-medium whitespace-nowrap text-warning',
        className,
      )}
    >
      <FlaskConical aria-hidden="true" className="size-3.5 shrink-0" />
      {t.demo.badge}
      <span className="sr-only"> — {t.demo.title}</span>
    </span>
  );
}
