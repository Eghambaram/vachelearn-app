import type { KpiChange } from '@/components/kpi-card';
import { DEFAULT_LOCALE } from '@/lib/format';

/**
 * Display-only change between a server-computed snapshot and its value at the period start. No change is shown when
 * the starting value is 0 (a percentage of nothing is meaningless).
 */
export function kpiChange(
  value: number,
  previousValue: number,
  period: string,
  { upIsGood = true, locale = DEFAULT_LOCALE }: { upIsGood?: boolean; locale?: string } = {},
): KpiChange | undefined {
  if (previousValue === 0) return undefined;
  const ratio = (value - previousValue) / previousValue;
  const direction = ratio > 0 ? 'up' : ratio < 0 ? 'down' : 'flat';
  const sentiment =
    direction === 'flat' ? 'neutral' : (direction === 'up') === upIsGood ? 'positive' : 'negative';
  return {
    direction,
    sentiment,
    period,
    value: new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 1,
      signDisplay: 'never',
    }).format(Math.abs(ratio)),
  };
}
