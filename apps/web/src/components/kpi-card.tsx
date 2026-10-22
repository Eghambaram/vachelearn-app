import * as React from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { DemoBadge } from '@/components/demo-badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export type KpiChange = {
  direction: 'up' | 'down' | 'flat';
  /** Pre-formatted by the caller from server values, e.g. "4 pts" or "12%". */
  value: string;
  /** Whether this change is good news. Up is not always good (e.g. overdue assignments), so it is stated, not inferred. */
  sentiment: 'positive' | 'negative' | 'neutral';
  /** The comparison period, e.g. "vs last month". */
  period?: string;
};

type KpiCardProps = {
  label: string;
  /** Pre-formatted value computed by the server (counts, rates, money via lib/format). */
  value?: string;
  change?: KpiChange;
  /** One line explaining the metric's definition or scope, e.g. "Mandatory courses, all branches you manage". */
  helper?: React.ReactNode;
  loading?: boolean;
  /** Shows the Demo badge; required for fixture data. */
  demo?: boolean;
  icon?: React.ReactNode;
  className?: string;
};

const DIRECTION_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight } as const;
const DIRECTION_TEXT = {
  up: t.kpi.increase,
  down: t.kpi.decrease,
  flat: t.kpi.unchanged,
} as const;
const SENTIMENT_CLASS = {
  positive: 'bg-success-subtle text-success',
  negative: 'bg-danger-subtle text-danger',
  neutral: 'bg-muted text-neutral-700',
} as const;

/** One headline metric. Change is shown as icon + words + colour, never colour alone. */
export function KpiCard({
  label,
  value,
  change,
  helper,
  loading = false,
  demo = false,
  icon,
  className,
}: KpiCardProps) {
  const DirectionIcon = change ? DIRECTION_ICON[change.direction] : null;
  const labelId = React.useId();
  return (
    <Card
      data-slot="kpi-card"
      role="group"
      aria-labelledby={labelId}
      aria-busy={loading || undefined}
      className={cn('gap-2 px-(--card-spacing)', className)}
    >
      <div className="flex flex-col gap-2">
        {/* Wraps on narrow cards so the Demo badge and icon never get clipped. */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p id={labelId} className="text-sm font-medium text-muted-foreground">
            {label}
          </p>
          <div className="flex items-center gap-2">
            {demo ? <DemoBadge /> : null}
            {icon ? (
              <span aria-hidden="true" className="text-muted-foreground [&_svg]:size-4">
                {icon}
              </span>
            ) : null}
          </div>
        </div>
        <div className="text-3xl font-semibold tabular-nums">
          {loading ? (
            <>
              <Skeleton className="h-9 w-24" />
              <span className="sr-only">{t.common.loading}</span>
            </>
          ) : (
            value
          )}
        </div>
        {change && DirectionIcon && !loading ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span
              data-sentiment={change.sentiment}
              className={cn(
                'inline-flex h-6 items-center gap-1 rounded-md px-1.5 font-medium',
                SENTIMENT_CLASS[change.sentiment],
              )}
            >
              <DirectionIcon aria-hidden="true" className="size-4" />
              <span className="sr-only">{DIRECTION_TEXT[change.direction]}</span>
              <span className="tabular-nums">{change.value}</span>
            </span>
            {change.period ? <span className="text-muted-foreground">{change.period}</span> : null}
          </p>
        ) : null}
        {helper ? <div className="text-xs text-muted-foreground">{helper}</div> : null}
      </div>
    </Card>
  );
}
