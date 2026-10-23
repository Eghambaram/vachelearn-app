/**
 * Display formatting. Storage is UTC; display uses the tenant/user timezone and locale (CLAUDE.md non-negotiables).
 * Defaults follow D-034 (India-first: en-IN, Asia/Kolkata, INR) until the real tenant settings arrive in Phase 2.
 */
export const DEFAULT_LOCALE = 'en-IN';
export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';
export const DEFAULT_CURRENCY = 'INR';

type Zoned = { timeZone?: string; locale?: string };

/** "20 Oct 2026" for an instant, in the given timezone. */
export function formatDate(
  instant: Date | string,
  { timeZone = DEFAULT_TIME_ZONE, locale = DEFAULT_LOCALE }: Zoned = {},
) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(instant));
}

/** "20 Oct 2026, 09:30 IST" — always shows the zone, because times are ambiguous without it. */
export function formatDateTime(
  instant: Date | string,
  { timeZone = DEFAULT_TIME_ZONE, locale = DEFAULT_LOCALE }: Zoned = {},
) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(new Date(instant));
}

/** A calendar date with no time (`YYYY-MM-DD`, e.g. a due date). Never shifted by any timezone. */
export function formatDateOnly(
  isoDate: string,
  { locale = DEFAULT_LOCALE }: { locale?: string } = {},
) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error(`Expected YYYY-MM-DD, got "${isoDate}"`);
  const [, y, m, d] = match;
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))));
}

export function formatNumber(value: number, { locale = DEFAULT_LOCALE }: { locale?: string } = {}) {
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * Money arrives as integer minor units + ISO 4217 code (never a float). Converted to an exact decimal string
 * before formatting, so large amounts never lose precision.
 */
export function formatMoney(
  minorUnits: number | bigint,
  currency: string = DEFAULT_CURRENCY,
  { locale = DEFAULT_LOCALE }: { locale?: string } = {},
) {
  if (typeof minorUnits === 'number' && !Number.isSafeInteger(minorUnits)) {
    throw new Error('Money must be an integer number of minor units');
  }
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const raw = BigInt(minorUnits);
  const negative = raw < 0n;
  const abs = (negative ? -raw : raw).toString().padStart(digits + 1, '0');
  const decimal = digits === 0 ? abs : `${abs.slice(0, -digits)}.${abs.slice(-digits)}`;
  // Intl accepts exact decimal strings (Intl.NumberFormat v3); typed as number in lib.dom.
  return formatter.format(`${negative ? '-' : ''}${decimal}` as unknown as number);
}

/** A rate sent as integer basis points (7350) shown as a percentage with one decimal ("73.5%"). */
export function formatBasisPoints(
  basisPoints: number,
  { locale = DEFAULT_LOCALE }: { locale?: string } = {},
) {
  if (!Number.isInteger(basisPoints)) throw new Error('Rates arrive as integer basis points');
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(basisPoints / 10_000);
}

/**
 * Label for a chart bucket that starts on a calendar date: "21 Sep" for weeks, "Sep 2026" for months. The date is
 * already in the reporting zone, so it is never shifted.
 */
export function formatBucketLabel(
  isoDate: string,
  granularity: 'week' | 'month',
  { locale = DEFAULT_LOCALE }: { locale?: string } = {},
) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error(`Expected YYYY-MM-DD, got "${isoDate}"`);
  const [, y, m, d] = match;
  const options: Intl.DateTimeFormatOptions =
    granularity === 'week'
      ? { day: 'numeric', month: 'short' }
      : { month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options }).format(
    new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))),
  );
}

/** The calendar date (YYYY-MM-DD) an instant falls on in a timezone, e.g. "today" for due-date arithmetic. */
export function calendarDateIn(instant: Date | string, timeZone: string = DEFAULT_TIME_ZONE) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}

/** Whole days from one calendar date to another (both YYYY-MM-DD; no timezone involved). */
export function daysBetween(fromIsoDate: string, toIsoDate: string) {
  const parse = (d: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (!m) throw new Error(`Expected YYYY-MM-DD, got "${d}"`);
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  return Math.round((parse(toIsoDate) - parse(fromIsoDate)) / 86_400_000);
}

/** "45 min", "1 h", "1 h 25 min" from whole minutes. */
export function formatDuration(minutes: number) {
  if (!Number.isInteger(minutes) || minutes < 0) throw new Error('Duration is whole minutes');
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Media time as "m:ss" or "h:mm:ss" from whole seconds. */
export function formatClock(seconds: number) {
  if (!Number.isInteger(seconds) || seconds < 0) throw new Error('Clock time is whole seconds');
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** "820 KB", "1.4 MB" from bytes (1 KB = 1000 bytes, as file managers show it). */
export function formatFileSize(
  bytes: number,
  { locale = DEFAULT_LOCALE }: { locale?: string } = {},
) {
  const [value, unit] =
    bytes >= 1e9
      ? [bytes / 1e9, 'GB']
      : bytes >= 1e6
        ? [bytes / 1e6, 'MB']
        : bytes >= 1e3
          ? [bytes / 1e3, 'KB']
          : [bytes, 'bytes'];
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: unit === 'bytes' || unit === 'KB' ? 0 : 1 }).format(value)} ${unit}`;
}
