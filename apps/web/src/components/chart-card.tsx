'use client';

import * as React from 'react';
import { BarChart3 } from 'lucide-react';
import { DemoBadge } from '@/components/demo-badge';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { en } from '@/messages/en';

export type ChartTableColumn = { key: string; label: string; numeric?: boolean };

/** The chart's data as a table: the accessible equivalent of the chart (WCAG 1.1.1), and its empty test. */
export type ChartTableData = {
  columns: readonly ChartTableColumn[];
  /** Cell values pre-formatted for display, keyed by column key. */
  rows: readonly Record<string, React.ReactNode>[];
};

type ChartCardProps = {
  title: string;
  description?: React.ReactNode;
  /** Plain-language takeaway, e.g. "Completion rose from 61% in May to 74% in October." Always visible. */
  summary: string;
  table: ChartTableData;
  /** The chart itself (a recharts chart inside ChartContainer). Not rendered when there is no data. */
  children: React.ReactNode;
  loading?: boolean;
  error?: { requestId?: string; onRetry?: () => void };
  demo?: boolean;
  /** Text for the no-data state; the default says the chart appears once data exists. */
  emptyDescription?: string;
  /** Extra header controls (period select, export). */
  actions?: React.ReactNode;
  className?: string;
};

export function ChartCard({
  title,
  description,
  summary,
  table,
  children,
  loading = false,
  error,
  demo = false,
  emptyDescription = en.chart.emptyDescription,
  actions,
  className,
}: ChartCardProps) {
  const titleId = React.useId();
  const summaryId = React.useId();
  const empty = table.rows.length === 0;

  let body: React.ReactNode;
  if (loading) {
    body = (
      <div role="status" aria-label={en.common.loading}>
        <Skeleton className="aspect-video w-full" />
      </div>
    );
  } else if (error) {
    body = <ErrorState headingLevel="h3" requestId={error.requestId} onRetry={error.onRetry} />;
  } else if (empty) {
    // No chart for data that does not exist yet (web rules): an empty state instead of empty axes.
    body = (
      <EmptyState
        headingLevel="h3"
        icon={<BarChart3 />}
        title={en.chart.emptyTitle}
        description={emptyDescription}
      />
    );
  } else {
    body = (
      <Tabs defaultValue="chart">
        <TabsList aria-label={en.chart.viewsLabel} className="self-end">
          <TabsTrigger value="chart">{en.chart.chart}</TabsTrigger>
          <TabsTrigger value="table">{en.chart.table}</TabsTrigger>
        </TabsList>
        <TabsContent value="chart">
          <figure aria-labelledby={titleId} aria-describedby={summaryId} className="m-0">
            {children}
          </figure>
        </TabsContent>
        <TabsContent value="table">
          <Table>
            <TableCaption className="sr-only">{title}</TableCaption>
            <TableHeader>
              <TableRow>
                {table.columns.map((column) => (
                  <TableHead
                    key={column.key}
                    scope="col"
                    className={cn(column.numeric && 'text-right')}
                  >
                    {column.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((row, index) => (
                <TableRow key={index}>
                  {table.columns.map((column, columnIndex) =>
                    columnIndex === 0 ? (
                      <TableHead key={column.key} scope="row" className="text-sm text-foreground">
                        {row[column.key]}
                      </TableHead>
                    ) : (
                      <TableCell
                        key={column.key}
                        className={cn(column.numeric && 'text-right tabular-nums')}
                      >
                        {row[column.key]}
                      </TableCell>
                    ),
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    );
  }

  return (
    <Card data-slot="chart-card" aria-busy={loading || undefined} className={className}>
      <CardHeader className="grid-cols-[1fr_auto]">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={titleId} className="text-base font-semibold">
              {title}
            </h3>
            {demo ? <DemoBadge /> : null}
          </div>
          {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {body}
        {!loading && !error && !empty ? (
          <p id={summaryId} className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{en.chart.summary}:</span> {summary}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
