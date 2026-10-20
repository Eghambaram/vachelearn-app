'use client';

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import type { PlatformDashboard } from '@vachelearn/contracts';
import { ChartCard } from '@/components/chart-card';
import {
  CHART_COLORS,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatBucketLabel, formatNumber } from '@/lib/format';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const c = t.platformDashboard.charts;

const GROWTH_CONFIG = {
  newTenants: { label: c.newTenants, color: CHART_COLORS[0] },
  totalTenants: { label: c.totalTenants, color: CHART_COLORS[1] },
} satisfies ChartConfig;

const ENROLL_CONFIG = {
  enrollments: { label: c.enrollments, color: CHART_COLORS[0] },
  completions: { label: c.completions, color: CHART_COLORS[1] },
} satisfies ChartConfig;

const STATUS_CONFIG = {
  active: { label: t.status.tenant.active, color: CHART_COLORS[0] },
  suspended: { label: t.status.tenant.suspended, color: CHART_COLORS[2] },
  archived: { label: t.status.tenant.archived, color: CHART_COLORS[3] },
} satisfies ChartConfig;

type Props = { data: PlatformDashboard; demo: boolean };

export function TenantGrowthChart({ data, demo }: Props) {
  const points = data.tenantGrowth.map((p) => ({
    ...p,
    label: formatBucketLabel(p.bucketStart, data.granularity),
  }));
  const added = points.reduce((sum, p) => sum + p.newTenants, 0);
  const first = points[0] ? points[0].totalTenants - points[0].newTenants : 0;
  return (
    <ChartCard
      headingLevel="h2"
      demo={demo}
      title={c.growthTitle}
      description={c.growthDescription}
      summary={c.growthSummary(
        formatNumber(first),
        formatNumber(points.at(-1)?.totalTenants ?? 0),
        formatNumber(added),
      )}
      table={{
        columns: [
          { key: 'label', label: c.bucket },
          { key: 'newTenants', label: c.newTenants, numeric: true },
          { key: 'totalTenants', label: c.totalTenants, numeric: true },
        ],
        rows: points.map((p) => ({
          label: p.label,
          newTenants: formatNumber(p.newTenants),
          totalTenants: formatNumber(p.totalTenants),
        })),
      }}
    >
      <ChartContainer config={GROWTH_CONFIG} className="max-h-72 w-full">
        <ComposedChart accessibilityLayer data={points}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={12} />
          <YAxis yAxisId="new" allowDecimals={false} width={32} tickLine={false} axisLine={false} />
          <YAxis
            yAxisId="total"
            orientation="right"
            allowDecimals={false}
            width={32}
            tickLine={false}
            axisLine={false}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar
            isAnimationActive={false}
            yAxisId="new"
            dataKey="newTenants"
            fill={GROWTH_CONFIG.newTenants.color}
            radius={4}
          />
          <Line
            isAnimationActive={false}
            yAxisId="total"
            dataKey="totalTenants"
            stroke={GROWTH_CONFIG.totalTenants.color}
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ChartContainer>
    </ChartCard>
  );
}

export function EnrollmentTrendChart({ data, demo }: Props) {
  const points = data.enrollmentTrend.map((p) => ({
    ...p,
    label: formatBucketLabel(p.bucketStart, data.granularity),
  }));
  return (
    <ChartCard
      headingLevel="h2"
      demo={demo}
      title={c.enrollTitle}
      description={c.enrollDescription}
      summary={c.enrollSummary(
        formatNumber(data.kpis.completionRate.enrolled),
        formatNumber(data.kpis.completionRate.completed),
      )}
      table={{
        columns: [
          { key: 'label', label: c.bucket },
          { key: 'enrollments', label: c.enrollments, numeric: true },
          { key: 'completions', label: c.completions, numeric: true },
        ],
        rows: points.map((p) => ({
          label: p.label,
          enrollments: formatNumber(p.enrollments),
          completions: formatNumber(p.completions),
        })),
      }}
    >
      <ChartContainer config={ENROLL_CONFIG} className="max-h-72 w-full">
        <LineChart accessibilityLayer data={points}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={12} />
          <YAxis allowDecimals={false} width={44} tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Line
            isAnimationActive={false}
            dataKey="enrollments"
            stroke={ENROLL_CONFIG.enrollments.color}
            strokeWidth={2}
            dot={false}
          />
          <Line
            isAnimationActive={false}
            dataKey="completions"
            stroke={ENROLL_CONFIG.completions.color}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
          />
        </LineChart>
      </ChartContainer>
    </ChartCard>
  );
}

export function TenantStatusChart({ data, demo }: Props) {
  const { active, suspended, archived } = data.kpis.tenants.byStatus;
  const slices = (['active', 'suspended', 'archived'] as const)
    .map((status) => ({ status, count: data.kpis.tenants.byStatus[status] }))
    .filter((slice) => slice.count > 0);
  return (
    <ChartCard
      headingLevel="h2"
      demo={demo}
      title={c.statusTitle}
      description={c.statusDescription}
      summary={c.statusSummary(active, suspended, archived)}
      table={{
        columns: [
          { key: 'status', label: c.status },
          { key: 'count', label: c.tenants, numeric: true },
        ],
        rows: slices.map((slice) => ({
          status: STATUS_CONFIG[slice.status].label,
          count: formatNumber(slice.count),
        })),
      }}
    >
      <ChartContainer config={STATUS_CONFIG} className="mx-auto aspect-square max-h-64">
        <PieChart accessibilityLayer>
          <ChartTooltip content={<ChartTooltipContent nameKey="status" hideLabel />} />
          <Pie
            isAnimationActive={false}
            data={slices}
            dataKey="count"
            nameKey="status"
            innerRadius="55%"
            strokeWidth={2}
          >
            {slices.map((slice) => (
              <Cell key={slice.status} fill={STATUS_CONFIG[slice.status].color} />
            ))}
          </Pie>
          <ChartLegend content={<ChartLegendContent nameKey="status" />} />
        </PieChart>
      </ChartContainer>
    </ChartCard>
  );
}
