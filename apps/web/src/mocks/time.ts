import type { DashboardPeriod } from '@vachelearn/contracts';

/*
 * Time helpers for demo fixtures only. Demo tenants and the platform report in Asia/Kolkata, which has no DST, so a
 * fixed offset is exact for bucket boundaries. The API (Phase 2+) uses a real timezone library for tenant zones.
 */

export const DAY = 86_400_000;
const IST_OFFSET = 330 * 60_000;

/** Calendar date (YYYY-MM-DD) of an instant in the reporting zone. */
export function zonedDate(instant: number) {
  return new Date(instant + IST_OFFSET).toISOString().slice(0, 10);
}

/** UTC instant of local midnight for a reporting-zone calendar date. */
export function zonedMidnight(isoDate: string) {
  return Date.parse(`${isoDate}T00:00:00.000Z`) - IST_OFFSET;
}

export function periodStartOf(period: DashboardPeriod, now: number) {
  const days = period === '30d' ? 30 : period === '90d' ? 90 : 365;
  return zonedMidnight(zonedDate(now - days * DAY));
}

/** Bucket start dates covering [start, now]: Mondays for weeks, 1st of month for months. */
export function buckets(granularity: 'week' | 'month', start: number, now: number) {
  const starts: string[] = [];
  const first = new Date(zonedDate(start) + 'T00:00:00.000Z');
  if (granularity === 'week') {
    first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  } else {
    first.setUTCDate(1);
  }
  for (const d = first; zonedMidnight(d.toISOString().slice(0, 10)) <= now;) {
    starts.push(d.toISOString().slice(0, 10));
    if (granularity === 'week') d.setUTCDate(d.getUTCDate() + 7);
    else d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return starts;
}
