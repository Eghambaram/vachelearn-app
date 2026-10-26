import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RoleKey } from '@/lib/api/session-types';
import { buildDemoSession } from '@/mocks/demo-session';

let current = buildDemoSession('tenant_admin', 'demo-tenant-1');
vi.mock('@/lib/api/session', () => ({ getSession: async () => current }));

// Fixed clock: 26 Oct 2026, 11:00 IST.
const NOW = new Date('2026-10-26T05:30:00.000Z');

const { getComplianceReport, getComplianceReportOptions } = await import('@/lib/api/reports');
// The browser calls the server action; here it goes straight to the same demo layer.
vi.mock('./actions', () => ({
  complianceReportAction: (query: unknown) => getComplianceReport(query, { now: NOW }),
}));
const { ComplianceReport } = await import('./compliance-report');

async function renderAs(role: RoleKey) {
  current = buildDemoSession(role, 'demo-tenant-1');
  const [initial, options] = await Promise.all([
    getComplianceReport({}, { now: NOW }),
    getComplianceReportOptions(),
  ]);
  if (!options.ok) throw new Error('expected options');
  render(<ComplianceReport initial={initial} options={options.data} demoState="ready" />);
}

// Radix Select uses pointer capture and scrollIntoView, which jsdom does not implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
});

describe('ComplianceReport', () => {
  it('states scope, filters, generated time and row count in one banner', async () => {
    await renderAs('tenant_admin');
    expect(screen.getByRole('note', { name: 'Report scope' })).toHaveTextContent(
      /^Scope: Example Manufacturing \(Demo\) \(all branches\) · Filters: none · Generated 26 Oct 2026, 11:00 IST · 120 rows$/,
    );
  });

  it('a branch admin’s banner names their branch; rows show only in-scope branches', async () => {
    await renderAs('branch_admin');
    expect(screen.getByRole('note', { name: 'Report scope' })).toHaveTextContent(
      /^Scope: Example Branch A1 · /,
    );
    const table = screen.getByRole('table', { name: /Compliance status by learner/ });
    expect(within(table).queryByText(/Branch A2|Head Office/)).toBeNull();
  });

  it('totals show every status in text with its count', async () => {
    await renderAs('tenant_admin');
    const totals = screen.getByRole('region', { name: 'Totals by status' });
    for (const label of ['Overdue', 'Due Soon', 'Not Started', 'Compliant', 'Not Applicable']) {
      expect(within(totals).getByText(label)).toBeVisible();
    }
  });

  it('filtering asks the server again and the banner echoes what it applied', async () => {
    await renderAs('tenant_admin');
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }));
    await userEvent.click(screen.getByRole('option', { name: 'Overdue' }));
    await waitFor(() =>
      expect(screen.getByRole('note', { name: 'Report scope' })).toHaveTextContent(
        'Filters: Status = Overdue',
      ),
    );
    // Read the rows from the DOM, not the accessibility tree: the closing Select briefly aria-hides the rest of the
    // page, which made a role query flaky under load (isolation review, 1.5.8).
    await waitFor(
      () => {
        const body = Array.from(document.querySelectorAll('tbody tr'));
        expect(body.length).toBeGreaterThan(0);
        expect(body.every((row) => row.textContent?.includes('Overdue'))).toBe(true);
      },
      { timeout: 5000 },
    );
  });
});
