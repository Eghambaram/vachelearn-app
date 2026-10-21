'use client';

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import type { TenantDashboard } from '@vachelearn/contracts';
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
const p = t.tenantDashboard.progress;

const CONFIG = {
  enrollments: { label: p.enrollments, color: CHART_COLORS[0] },
  completions: { label: p.completions, color: CHART_COLORS[1] },
} satisfies ChartConfig;

export function LearningProgressChart({ data, demo }: { data: TenantDashboard; demo: boolean }) {
  const points = data.learningProgress.map((point) => ({
    ...point,
    label: formatBucketLabel(point.bucketStart, data.granularity),
  }));
  return (
    <ChartCard
      headingLevel="h2"
      demo={demo}
      title={p.title}
      description={p.description}
      summary={p.summary(
        formatNumber(data.kpis.completionRate.enrolled),
        formatNumber(data.kpis.completionRate.completed),
      )}
      table={{
        columns: [
          { key: 'label', label: p.bucket },
          { key: 'enrollments', label: p.enrollments, numeric: true },
          { key: 'completions', label: p.completions, numeric: true },
        ],
        rows: points.map((point) => ({
          label: point.label,
          enrollments: formatNumber(point.enrollments),
          completions: formatNumber(point.completions),
        })),
      }}
    >
      <ChartContainer config={CONFIG} className="max-h-72 w-full">
        <LineChart accessibilityLayer data={points}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={12} />
          <YAxis allowDecimals={false} width={44} tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Line
            isAnimationActive={false}
            dataKey="enrollments"
            stroke={CONFIG.enrollments.color}
            strokeWidth={2}
            dot={false}
          />
          <Line
            isAnimationActive={false}
            dataKey="completions"
            stroke={CONFIG.completions.color}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
          />
        </LineChart>
      </ChartContainer>
    </ChartCard>
  );
}
