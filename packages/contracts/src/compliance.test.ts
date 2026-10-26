import { complianceStatus, ComplianceReportQuery, type ComplianceInput } from './compliance';

/** "Today" in a zone for a fixed instant — the caller's job; done here so the boundary tests use real zones. */
function todayIn(instant: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}

const open = (dueOn: string | null): ComplianceInput => ({
  applicable: true,
  completed: false,
  validThrough: null,
  dueOn,
});
const done = (validThrough: string | null): ComplianceInput => ({
  applicable: true,
  completed: true,
  validThrough,
  dueOn: null,
});

describe('complianceStatus (D-018)', () => {
  const today = '2026-10-26';

  it('not applicable wins over everything', () => {
    expect(complianceStatus({ ...done(null), applicable: false }, today)).toBe('not_applicable');
    expect(complianceStatus({ ...open('2026-01-01'), applicable: false }, today)).toBe(
      'not_applicable',
    );
  });

  it('due date: day after → overdue; due today and 30 days out → due soon; 31 days → not started', () => {
    expect(complianceStatus(open('2026-10-25'), today)).toBe('overdue');
    expect(complianceStatus(open('2026-10-26'), today)).toBe('due_soon');
    expect(complianceStatus(open('2026-11-25'), today)).toBe('due_soon');
    expect(complianceStatus(open('2026-11-26'), today)).toBe('not_started');
    expect(complianceStatus(open(null), today)).toBe('not_started');
  });

  it('validity: expired → overdue; ends within 30 days (incl. today) → due soon; later or never → compliant', () => {
    expect(complianceStatus(done('2026-10-25'), today)).toBe('overdue');
    expect(complianceStatus(done('2026-10-26'), today)).toBe('due_soon');
    expect(complianceStatus(done('2026-11-25'), today)).toBe('due_soon');
    expect(complianceStatus(done('2026-11-26'), today)).toBe('compliant');
    expect(complianceStatus(done(null), today)).toBe('compliant');
  });

  it('month and year boundaries', () => {
    expect(complianceStatus(open('2027-01-25'), '2026-12-26')).toBe('due_soon');
    expect(complianceStatus(open('2026-12-31'), '2027-01-01')).toBe('overdue');
    expect(complianceStatus(open('2028-03-01'), '2028-01-31')).toBe('due_soon'); // leap year: 30 days
  });

  it('the same instant is due soon in Chicago but overdue in Kolkata', () => {
    // 18:45 UTC on 26 Oct is already 27 Oct in Kolkata (UTC+5:30) but still 26 Oct in Chicago (UTC-5).
    const instant = '2026-10-26T18:45:00Z';
    expect(complianceStatus(open('2026-10-26'), todayIn(instant, 'America/Chicago'))).toBe(
      'due_soon',
    );
    expect(complianceStatus(open('2026-10-26'), todayIn(instant, 'Asia/Kolkata'))).toBe('overdue');
  });
});

describe('ComplianceReportQuery', () => {
  it('allowlists sort fields and refuses unknown parameters (no tenantId from the client)', () => {
    expect(ComplianceReportQuery.parse({})).toMatchObject({
      sort: 'status',
      direction: 'asc',
      limit: 25,
    });
    expect(ComplianceReportQuery.safeParse({ sort: 'email' }).success).toBe(false);
    expect(ComplianceReportQuery.safeParse({ tenantId: 'demo-tenant-2' }).success).toBe(false);
    expect(ComplianceReportQuery.safeParse({ limit: 101 }).success).toBe(false);
  });
});
