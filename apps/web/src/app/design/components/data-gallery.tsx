'use client';

import * as React from 'react';
import { Bell, BookOpen, Plus, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { ChartCard } from '@/components/chart-card';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { DemoBadge } from '@/components/demo-badge';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { FilterBar } from '@/components/filter-bar';
import { FormField } from '@/components/form-field';
import { KpiCard } from '@/components/kpi-card';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { PermissionDenied } from '@/components/permission-denied';
import { StatusBadge } from '@/components/status-badge';
import { Stepper } from '@/components/stepper';
import { Button } from '@/components/ui/button';
import {
  CHART_COLORS,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDateOnly } from '@/lib/format';
import {
  DEFAULT_PAGE_LIMIT,
  useCursorPagination,
  useDebouncedValue,
  type PageLimit,
  type SortState,
} from '@/lib/table';
import { en } from '@/messages/en';
import {
  EXAMPLE_COMPLETION_BY_BRANCH,
  EXAMPLE_MONTHLY_TREND,
  listExampleLearners,
  type ExampleLearner,
  type ExampleListQuery,
} from './gallery-fixtures';
import { Section } from './gallery-section';

const BAR_CONFIG = {
  completed: { label: 'Completed %', color: CHART_COLORS[0] },
  overdue: { label: 'Overdue %', color: CHART_COLORS[2] },
} satisfies ChartConfig;

const LINE_CONFIG = {
  mandatory: { label: 'Mandatory courses', color: CHART_COLORS[0] },
  optional: { label: 'Optional courses (dashed)', color: CHART_COLORS[1] },
} satisfies ChartConfig;

const LEARNER_COLUMNS: DataTableColumn<ExampleLearner>[] = [
  { id: 'name', header: 'Learner', cell: (row) => row.name, sortField: 'name' },
  { id: 'branch', header: 'Branch', cell: (row) => row.branch },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => <StatusBadge entity="enrollment" status={row.status} />,
  },
  { id: 'due', header: 'Due', cell: (row) => formatDateOnly(row.dueOn), sortField: 'dueOn' },
  {
    id: 'progress',
    header: 'Progress',
    cell: (row) => `${row.progress}%`,
    sortField: 'progress',
    align: 'end',
  },
];

const STATUS_FILTERS = ['all', 'not_started', 'in_progress', 'completed', 'overdue'] as const;

function galleryToast(message: string) {
  toast.info(`${message} (gallery only — nothing was sent or saved)`);
}

function LearnerTableDemo() {
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [status, setStatus] = React.useState<ExampleListQuery['status']>('all');
  const [sort, setSort] = React.useState<SortState>({ field: 'name', direction: 'asc' });
  const [limit, setLimit] = React.useState<PageLimit>(DEFAULT_PAGE_LIMIT);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [mode, setMode] = React.useState<'ready' | 'loading' | 'error'>('ready');
  const pager = useCursorPagination();

  const result = listExampleLearners({
    search: debouncedSearch,
    status,
    sort,
    cursor: pager.cursor,
    limit,
  });

  // Any change to the query starts again at page 1 with nothing selected.
  function restart() {
    pager.reset();
    setSelected(new Set());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <DemoBadge />
        <span className="text-sm text-muted-foreground">Show state:</span>
        {(['ready', 'loading', 'error'] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={mode === value ? 'secondary' : 'ghost'}
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className="capitalize"
          >
            {value}
          </Button>
        ))}
      </div>
      <DataTable<ExampleLearner>
        caption="Example learners"
        columns={LEARNER_COLUMNS}
        rows={mode === 'ready' ? result.data : []}
        getRowId={(row) => row.id}
        getRowLabel={(row) => row.name}
        status={mode}
        error={{ requestId: 'req_example_0001', onRetry: () => setMode('ready') }}
        sort={sort}
        onSortChange={(next) => {
          setSort(next);
          restart();
        }}
        selection={{ selected, onChange: setSelected }}
        bulkActions={(ids) => (
          <Button size="sm" onClick={() => galleryToast(`Reminder for ${ids.length} learners`)}>
            <Bell aria-hidden="true" />
            Send reminder
          </Button>
        )}
        rowActions={(row) => [
          { label: 'View progress', onSelect: () => galleryToast(`Progress of ${row.name}`) },
          { label: 'Send reminder', onSelect: () => galleryToast(`Reminder to ${row.name}`) },
        ]}
        empty={{
          title: 'No learners match',
          description: 'Try a different search or clear the filters.',
        }}
        toolbar={
          <FilterBar
            search={{
              value: search,
              onChange: (value) => {
                setSearch(value);
                restart();
              },
              label: 'Search learners',
              placeholder: 'Name',
            }}
            activeCount={status === 'all' ? 0 : 1}
            onClear={() => {
              setSearch('');
              setStatus('all');
              restart();
            }}
          >
            <FormField label="Status" className="md:w-48">
              {(field) => (
                <Select
                  value={status}
                  onValueChange={(value) => {
                    setStatus(value as ExampleListQuery['status']);
                    restart();
                  }}
                >
                  <SelectTrigger {...field} className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTERS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value === 'all' ? 'All statuses' : en.status.enrollment[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          </FilterBar>
        }
        footer={
          <Pagination
            pageIndex={pager.pageIndex}
            hasPrevious={pager.hasPrevious}
            hasNext={mode === 'ready' && result.page.nextCursor !== null}
            onPrevious={() => {
              pager.goPrevious();
              setSelected(new Set());
            }}
            onNext={() => {
              if (result.page.nextCursor) pager.goNext(result.page.nextCursor);
              setSelected(new Set());
            }}
            limit={limit}
            onLimitChange={(next) => {
              setLimit(next);
              restart();
            }}
            disabled={mode === 'loading'}
          />
        }
      />
    </div>
  );
}

export function DataGallery() {
  const barTable = {
    columns: [
      { key: 'branch', label: 'Branch' },
      { key: 'completed', label: 'Completed', numeric: true },
      { key: 'overdue', label: 'Overdue', numeric: true },
    ],
    rows: EXAMPLE_COMPLETION_BY_BRANCH.map((row) => ({
      branch: row.branch,
      completed: `${row.completed}%`,
      overdue: `${row.overdue}%`,
    })),
  };
  const lineTable = {
    columns: [
      { key: 'month', label: 'Month' },
      { key: 'mandatory', label: 'Mandatory', numeric: true },
      { key: 'optional', label: 'Optional', numeric: true },
    ],
    rows: EXAMPLE_MONTHLY_TREND.map((row) => ({
      month: row.month,
      mandatory: `${row.mandatory}%`,
      optional: `${row.optional}%`,
    })),
  };

  return (
    <>
      <Section id="page-header" title="Page header and breadcrumbs">
        <PageHeader
          headingLevel="h2"
          title="Example course"
          breadcrumbs={[
            { label: 'Courses', href: '/design/components' },
            { label: 'Safety', href: '/design/components' },
            { label: 'Example course' },
          ]}
          meta={
            <>
              <StatusBadge entity="course" status="draft" />
              <DemoBadge />
            </>
          }
          description="Version 2 draft. Learners keep seeing published version 1 until you publish."
          actions={
            <>
              <Button variant="outline" onClick={() => galleryToast('Preview')}>
                Preview
              </Button>
              <Button onClick={() => galleryToast('Publish version 2')}>Publish version 2</Button>
            </>
          }
        />
      </Section>

      <Section id="kpis" title="KPI cards">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            demo
            label="Active learners"
            value="1,204"
            icon={<Users />}
            change={{
              direction: 'up',
              value: '6%',
              sentiment: 'positive',
              period: 'vs last month',
            }}
            helper="Signed in during the last 30 days"
          />
          <KpiCard
            demo
            label="Overdue assignments"
            value="18"
            change={{ direction: 'up', value: '4', sentiment: 'negative', period: 'vs last week' }}
            helper="Up is bad here, so the change is shown in red"
          />
          <KpiCard
            demo
            label="Courses published"
            value="42"
            icon={<BookOpen />}
            change={{
              direction: 'flat',
              value: '0',
              sentiment: 'neutral',
              period: 'vs last month',
            }}
          />
          <KpiCard label="Certificates issued" loading />
        </div>
      </Section>

      <Section id="charts" title="Chart cards">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            demo
            title="Completion by branch"
            description="Mandatory courses, current quarter"
            summary="Example Head Office leads at 81% completed; Example Branch A2 has the most overdue (15%)."
            table={barTable}
          >
            <ChartContainer config={BAR_CONFIG} className="max-h-72 w-full">
              <BarChart accessibilityLayer data={[...EXAMPLE_COMPLETION_BY_BRANCH]}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="branch"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: string) => value.replace('Example ', '')}
                />
                <YAxis unit="%" width={44} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="completed" fill={BAR_CONFIG.completed.color} radius={4} />
                <Bar dataKey="overdue" fill={BAR_CONFIG.overdue.color} radius={4} />
              </BarChart>
            </ChartContainer>
          </ChartCard>
          <ChartCard
            demo
            title="Completion trend"
            description="Share of assigned courses completed, by month"
            summary="Mandatory completion rose from 61% in May to 74% in October; optional from 38% to 49%."
            table={lineTable}
          >
            <ChartContainer config={LINE_CONFIG} className="max-h-72 w-full">
              <LineChart accessibilityLayer data={[...EXAMPLE_MONTHLY_TREND]}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis unit="%" width={44} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  dataKey="mandatory"
                  stroke={LINE_CONFIG.mandatory.color}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  dataKey="optional"
                  stroke={LINE_CONFIG.optional.color}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          </ChartCard>
          <ChartCard
            title="Attendance by session"
            summary=""
            table={{ columns: [{ key: 'session', label: 'Session' }], rows: [] }}
            emptyDescription="Attendance appears after the first classroom session is recorded."
          >
            {null}
          </ChartCard>
          <ChartCard
            title="Assessment pass rate"
            summary=""
            table={barTable}
            error={{ requestId: 'req_example_0002', onRetry: () => galleryToast('Retry') }}
          >
            {null}
          </ChartCard>
        </div>
      </Section>

      <Section id="data-table" title="Data table, filter bar and pagination">
        <LearnerTableDemo />
      </Section>

      <Section id="tabs-stepper" title="Tabs and stepper">
        <div className="flex flex-col gap-8">
          <Tabs defaultValue="overview">
            <TabsList variant="line" aria-label="Course sections">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="learners">Learners</TabsTrigger>
              <TabsTrigger value="settings" disabled>
                Settings
              </TabsTrigger>
            </TabsList>
            <TabsContent value="overview">Overview panel (example content).</TabsContent>
            <TabsContent value="content">Content panel (example content).</TabsContent>
            <TabsContent value="learners">Learners panel (example content).</TabsContent>
          </Tabs>
          <Stepper
            aria-label="Course builder progress"
            currentIndex={2}
            steps={[
              { id: 'details', label: 'Details', description: 'Title, category, level' },
              { id: 'content', label: 'Content', description: 'Modules and lessons' },
              { id: 'assessment', label: 'Assessment', description: 'Questions and pass mark' },
              { id: 'publish', label: 'Review and publish' },
            ]}
          />
          <Stepper
            aria-label="Import progress (with an error)"
            orientation="vertical"
            currentIndex={1}
            steps={[
              { id: 'upload', label: 'Upload file' },
              { id: 'map', label: 'Map columns', state: 'error', description: '2 rows need fixes' },
              { id: 'confirm', label: 'Confirm import' },
            ]}
          />
        </div>
      </Section>

      <Section id="states" title="Empty, error and permission-denied states">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <EmptyState
            headingLevel="h3"
            title="No courses yet"
            description="Create a course to start assigning learning."
            action={
              <Button onClick={() => galleryToast('Create course')}>
                <Plus aria-hidden="true" />
                Create course
              </Button>
            }
          />
          <ErrorState
            headingLevel="h3"
            requestId="req_example_0003"
            onRetry={() => galleryToast('Retry')}
          />
          <PermissionDenied
            headingLevel="h3"
            action={
              <Button variant="outline" asChild>
                <a href="/design/components">Back to components</a>
              </Button>
            }
          />
        </div>
      </Section>
    </>
  );
}
