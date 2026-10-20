import type { LucideIcon } from 'lucide-react';
import { Archive, CircleAlert, CircleCheck, CircleDashed, Clock, Loader } from 'lucide-react';
import { cn } from '@/lib/utils';
import { statusTone, type StatusEntity, type StatusOf, type StatusTone } from '@/lib/status';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-success-subtle text-success',
  info: 'bg-info-subtle text-info',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  neutral: 'bg-muted text-neutral-700',
  muted: 'bg-muted text-muted-foreground',
};

// Icon shape differs per tone so status never depends on colour alone (WCAG 1.4.1).
const TONE_ICONS: Record<StatusTone, LucideIcon> = {
  success: CircleCheck,
  info: Loader,
  warning: Clock,
  danger: CircleAlert,
  neutral: CircleDashed,
  muted: Archive,
};

type StatusBadgeProps<E extends StatusEntity> = {
  entity: E;
  status: StatusOf<E>;
  /** Overrides the default English label (i18n, D-028). */
  label?: string;
  className?: string;
};

/** The one way to show a status: exact vocabulary label + tone colour + tone icon. */
export function StatusBadge<E extends StatusEntity>({
  entity,
  status,
  label,
  className,
}: StatusBadgeProps<E>) {
  const tone = statusTone(entity, status);
  const Icon = TONE_ICONS[tone];
  const text = label ?? (t.status[entity] as Record<string, string>)[status];
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex h-6 w-fit items-center gap-1 rounded-md px-2 text-xs font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {text}
    </span>
  );
}
