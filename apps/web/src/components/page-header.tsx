import * as React from 'react';
import { Breadcrumbs, type BreadcrumbEntry } from '@/components/breadcrumbs';
import { cn } from '@/lib/utils';

type PageHeaderProps = {
  /** The page's only h1. */
  title: string;
  /** Keep `h1` in the app; `h2` exists only for previews inside another page (the /design gallery). */
  headingLevel?: 'h1' | 'h2';
  description?: React.ReactNode;
  breadcrumbs?: readonly BreadcrumbEntry[];
  /** Inline after the title, e.g. a StatusBadge or DemoBadge. */
  meta?: React.ReactNode;
  /** Primary action last (rightmost on desktop); render only actions the viewer is permitted to take. */
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  breadcrumbs,
  meta,
  actions,
  headingLevel: Heading = 'h1',
  className,
}: PageHeaderProps) {
  return (
    <header data-slot="page-header" className={cn('flex flex-col gap-3', className)}>
      {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Heading className="text-2xl font-semibold wrap-break-word sm:text-3xl">
              {title}
            </Heading>
            {meta}
          </div>
          {description ? (
            <div className="max-w-3xl text-sm text-muted-foreground sm:text-base">
              {description}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
