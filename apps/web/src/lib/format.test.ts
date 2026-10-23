import {
  calendarDateIn,
  daysBetween,
  formatBasisPoints,
  formatBucketLabel,
  formatClock,
  formatFileSize,
  formatPercentTenths,
  formatDuration,
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatMoney,
  formatNumber,
} from './format';

// 18:45 UTC on 20 Oct is already 21 Oct in Kolkata (UTC+5:30) but still 20 Oct in Chicago (UTC-5 in October).
const LATE_EVENING_UTC = '2026-10-20T18:45:00Z';

describe('formatDateTime / formatDate across timezones', () => {
  it('shows the next calendar day in Asia/Kolkata, with the IST label', () => {
    expect(formatDateTime(LATE_EVENING_UTC)).toBe('21 Oct 2026, 00:15 IST');
    expect(formatDate(LATE_EVENING_UTC)).toBe('21 Oct 2026');
  });

  it('shows the same instant as 20 Oct in America/Chicago, with an unambiguous zone', () => {
    expect(formatDateTime(LATE_EVENING_UTC, { timeZone: 'America/Chicago' })).toBe(
      '20 Oct 2026, 13:45 GMT-5',
    );
    expect(formatDate(LATE_EVENING_UTC, { timeZone: 'America/Chicago' })).toBe('20 Oct 2026');
  });

  it('handles the exact Kolkata midnight boundary (18:29:59Z vs 18:30:00Z)', () => {
    expect(formatDate('2026-10-20T18:29:59Z')).toBe('20 Oct 2026');
    expect(formatDate('2026-10-20T18:30:00Z')).toBe('21 Oct 2026');
  });
});

describe('formatDateOnly', () => {
  it('never shifts a calendar date, whatever the runtime timezone', () => {
    expect(formatDateOnly('2026-10-25')).toBe('25 Oct 2026');
  });

  it('rejects anything that is not YYYY-MM-DD', () => {
    expect(() => formatDateOnly('25/10/2026')).toThrow();
  });
});

describe('formatMoney (integer minor units + ISO currency)', () => {
  it('formats INR with Indian digit grouping', () => {
    expect(formatMoney(1_250_000_050)).toBe('₹1,25,00,000.50');
  });

  it('handles small and negative amounts exactly', () => {
    expect(formatMoney(5)).toBe('₹0.05');
    expect(formatMoney(-5)).toBe('-₹0.05');
  });

  it('keeps precision beyond Number.MAX_SAFE_INTEGER when given a bigint', () => {
    expect(formatMoney(12_345_678_901_234_567_89n)).toBe('₹12,34,56,78,90,12,34,567.89');
  });

  it('respects zero-decimal currencies', () => {
    expect(formatMoney(1234, 'JPY')).toBe('JP¥1,234');
  });

  it('refuses floats', () => {
    expect(() => formatMoney(10.5)).toThrow();
  });
});

describe('formatNumber', () => {
  it('uses Indian grouping by default', () => {
    expect(formatNumber(1234567)).toBe('12,34,567');
  });
});

describe('formatBasisPoints', () => {
  it('shows integer basis points as a one-decimal percentage', () => {
    expect(formatBasisPoints(7350)).toBe('73.5%');
    expect(formatBasisPoints(0)).toBe('0.0%');
    expect(formatBasisPoints(10_000)).toBe('100.0%');
  });

  it('refuses fractional basis points (the server sends integers)', () => {
    expect(() => formatBasisPoints(73.5)).toThrow();
  });
});

describe('formatBucketLabel', () => {
  it('labels weekly and monthly buckets without shifting the date', () => {
    expect(formatBucketLabel('2026-09-21', 'week')).toBe('21 Sept');
    expect(formatBucketLabel('2026-10-01', 'month')).toBe('Oct 2026');
  });
});

describe('calendarDateIn / daysBetween', () => {
  it('finds "today" in the given zone, across the UTC date line', () => {
    // 20 Oct 2026 20:00 UTC is already 21 Oct in Kolkata but still 20 Oct in Chicago.
    expect(calendarDateIn('2026-10-20T20:00:00Z', 'Asia/Kolkata')).toBe('2026-10-21');
    expect(calendarDateIn('2026-10-20T20:00:00Z', 'America/Chicago')).toBe('2026-10-20');
  });

  it('counts whole calendar days, across month ends and DST changes', () => {
    expect(daysBetween('2026-10-20', '2026-10-23')).toBe(3);
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
    expect(daysBetween('2026-10-23', '2026-10-20')).toBe(-3);
  });
});

describe('formatDuration', () => {
  it('shows minutes, hours, or both', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(85)).toBe('1 h 25 min');
    expect(formatDuration(0)).toBe('0 min');
    expect(() => formatDuration(1.5)).toThrow();
  });
});

describe('formatClock', () => {
  it('shows m:ss, or h:mm:ss from an hour', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(252)).toBe('4:12');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(() => formatClock(-1)).toThrow();
  });
});

describe('formatFileSize', () => {
  it('picks a unit and keeps one decimal from MB', () => {
    expect(formatFileSize(512)).toBe('512 bytes');
    expect(formatFileSize(180_000)).toBe('180 KB');
    expect(formatFileSize(1_430_000)).toBe('1.4 MB');
    expect(formatFileSize(2_000_000_000)).toBe('2 GB');
  });
});

describe('formatPercentTenths', () => {
  it('always shows one decimal', () => {
    expect(formatPercentTenths(925)).toBe('92.5%');
    expect(formatPercentTenths(700)).toBe('70.0%');
    expect(formatPercentTenths(1000)).toBe('100.0%');
    expect(formatPercentTenths(0)).toBe('0.0%');
  });
});
