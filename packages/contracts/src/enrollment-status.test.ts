import { enrollmentDisplayStatus } from './enrollment-status';

/** "Today" in a zone for a fixed instant — the caller's job; done here so the boundary tests use real zones. */
function todayIn(instant: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}

describe('enrollmentDisplayStatus (D-054: overdue is derived, due date met through the end of the day)', () => {
  const due = '2026-10-21';

  it('day before, day of and day after the due date', () => {
    expect(enrollmentDisplayStatus('in_progress', due, '2026-10-20')).toBe('in_progress');
    expect(enrollmentDisplayStatus('in_progress', due, '2026-10-21')).toBe('in_progress');
    expect(enrollmentDisplayStatus('in_progress', due, '2026-10-22')).toBe('overdue');
    expect(enrollmentDisplayStatus('not_started', due, '2026-10-22')).toBe('overdue');
  });

  it('the same instant can be overdue in Kolkata and not yet in Chicago', () => {
    // 21 Oct 2026 20:00 UTC = 22 Oct 01:30 in Kolkata, 21 Oct 15:00 in Chicago.
    const instant = '2026-10-21T20:00:00Z';
    expect(enrollmentDisplayStatus('in_progress', due, todayIn(instant, 'Asia/Kolkata'))).toBe(
      'overdue',
    );
    expect(enrollmentDisplayStatus('in_progress', due, todayIn(instant, 'America/Chicago'))).toBe(
      'in_progress',
    );
  });

  it('completed and cancelled are never overdue; no due date is never overdue', () => {
    expect(enrollmentDisplayStatus('completed', '2020-01-01', '2026-10-22')).toBe('completed');
    expect(enrollmentDisplayStatus('cancelled', '2020-01-01', '2026-10-22')).toBe('cancelled');
    expect(enrollmentDisplayStatus('in_progress', null, '2026-10-22')).toBe('in_progress');
  });

  it('handles month and year boundaries as calendar dates', () => {
    expect(enrollmentDisplayStatus('in_progress', '2026-10-31', '2026-11-01')).toBe('overdue');
    expect(enrollmentDisplayStatus('in_progress', '2026-12-31', '2027-01-01')).toBe('overdue');
    expect(enrollmentDisplayStatus('in_progress', '2026-12-31', '2026-12-31')).toBe('in_progress');
  });
});
