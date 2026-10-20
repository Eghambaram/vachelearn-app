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
