import * as React from 'react';
import Link from 'next/link';
import { DemoBadge } from '@/components/demo-badge';
import { EmptyState } from '@/components/empty-state';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatDateTime } from '@/lib/format';

export type ActivityItem = {
  id: string;
  /** Decorative; the text must say what happened on its own. */
  icon: React.ReactNode;
  /** "Actor did something to subject". */
  content: React.ReactNode;
  occurredAt: string;
};

/** Card listing recent audit events, newest first, with the time and its zone. */
export function ActivityFeed({
  title,
  items,
  timeZone,
  viewAll,
  emptyTitle,
  demo = false,
}: {
  title: string;
  items: readonly ActivityItem[];
  timeZone: string;
  viewAll?: { href: string; label: string };
  emptyTitle: string;
  demo?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto]">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">{title}</h2>
          {demo ? <DemoBadge /> : null}
        </div>
        {viewAll ? (
          <Link
            href={viewAll.href}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {viewAll.label}
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState headingLevel="h3" title={emptyTitle} />
        ) : (
          <ol className="flex flex-col divide-y">
            {items.map((item) => (
              <li key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-neutral-700 [&_svg]:size-4"
                >
                  {item.icon}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                  <p>{item.content}</p>
                  <time dateTime={item.occurredAt} className="text-xs text-muted-foreground">
                    {formatDateTime(item.occurredAt, { timeZone })}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
