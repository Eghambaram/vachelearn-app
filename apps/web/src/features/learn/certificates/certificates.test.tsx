import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEMO_REVOCATION_REASON } from '@/mocks/certificates';
import { buildDemoSession } from '@/mocks/demo-session';

vi.mock('@/lib/api/session', () => ({
  getSession: async () => buildDemoSession('learner', 'demo-tenant-1'),
}));

const { getMyCertificate, getMyCertificates } = await import('@/lib/api/learner');
const { verifyCertificate } = await import('@/lib/api/verification');
const { CertificateList } = await import('./certificate-list');
const { CertificateDetail } = await import('./certificate-detail');
const { VerificationResult } = await import('@/features/verify/verification-result');

// Fixed clock: 22 Oct 2026, 15:00 IST.
const NOW = new Date('2026-10-22T09:30:00.000Z');
const CURRENT = 'demo-tenant-1-demo-user-enr-07-cert-2';
const SUPERSEDED = 'demo-tenant-1-demo-user-enr-07-cert-1';
const REVOKED = 'demo-tenant-1-demo-user-enr-12-cert-1';

async function detail(awardId: string) {
  const result = await getMyCertificate(awardId, { now: NOW });
  if (!result.ok) throw new Error(`expected data, got ${result.status}`);
  return result.data;
}

describe('CertificateList', () => {
  it('lists every award with its status in text and a named link', async () => {
    const result = await getMyCertificates({ now: NOW });
    if (!result.ok) throw new Error('expected data');
    render(<CertificateList data={result.data} />);
    const list = screen.getByRole('list', { name: 'Your certificates' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(
      screen.getByRole('link', {
        name: /^View certificate ?\(Hot Work Permits \(Demo\), Revoked\)$/,
      }),
    ).toHaveAttribute('href', `/learn/certificates/${REVOKED}`);
    expect(screen.getByText(/^Expired /)).toBeInTheDocument();
    expect(screen.getByText('Does not expire')).toBeInTheDocument();
  });

  it('empty: says how certificates are earned', () => {
    render(
      <CertificateList
        data={{ data: [], page: { nextCursor: null, limit: 25 }, timeZone: 'UTC' }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No certificates yet' })).toBeInTheDocument();
  });
});

describe('CertificateDetail (D-074)', () => {
  it('a valid certificate: labelled demo preview with the holder’s full name, not-connected download', async () => {
    render(<CertificateDetail data={await detail(CURRENT)} />);
    expect(screen.getByText('Demo preview — the PDF is the official copy.')).toBeVisible();
    const preview = screen.getByRole('region', { name: 'Certificate preview' });
    expect(within(preview).getByText('Demo User')).toBeVisible();
    expect(within(preview).getByText('First Aid Essentials (Demo)')).toBeVisible();
    expect(screen.queryByRole('note')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(
      screen.getByText(/PDF certificates arrive in Phase 4\. Nothing was downloaded\./),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open the verification page' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/verify\/VL(-[0-9A-HJKMNP-TV-Z]{4}){4}$/),
    );
  });

  it('a superseded certificate says so in words and links to the current one', async () => {
    render(<CertificateDetail data={await detail(SUPERSEDED)} />);
    expect(screen.getByRole('note')).toHaveTextContent('was replaced on');
    expect(screen.getByRole('link', { name: 'View the current certificate' })).toHaveAttribute(
      'href',
      `/learn/certificates/${CURRENT}`,
    );
  });

  it('copy link copies the public verification URL and confirms it', async () => {
    const user = userEvent.setup();
    render(<CertificateDetail data={await detail(CURRENT)} />);
    await user.click(screen.getByRole('button', { name: 'Copy verification link' }));
    expect(await navigator.clipboard.readText()).toMatch(/^http:\/\/localhost(:\d+)?\/verify\/VL-/);
    expect(screen.getByText('Verification link copied.')).toBeVisible();
  });
});

describe('VerificationResult (public, D-017)', () => {
  async function verified(awardId: string) {
    const { award } = await detail(awardId);
    const result = await verifyCertificate(award.verificationId, { now: NOW });
    if (!result.ok) throw new Error('expected data');
    return result.data;
  }

  it('valid: status in words, masked name only', async () => {
    render(<VerificationResult data={await verified(CURRENT)} />);
    expect(screen.getByText('This certificate is valid.')).toBeVisible();
    expect(screen.getByText('D. U***')).toBeVisible();
    expect(screen.queryByText('Demo User')).toBeNull();
  });

  it('revoked: the date in words, never the reason', async () => {
    const { container } = render(<VerificationResult data={await verified(REVOKED)} />);
    expect(
      screen.getByText(/This certificate was revoked on .*\. It is not valid\./),
    ).toBeVisible();
    expect(container).not.toHaveTextContent(DEMO_REVOCATION_REASON);
  });
});
