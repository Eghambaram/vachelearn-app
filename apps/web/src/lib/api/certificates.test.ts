import type { RoleKey } from './session-types';
import { DEMO_REVOCATION_REASON } from '@/mocks/certificates';
import { buildDemoSession } from '@/mocks/demo-session';

let current = buildDemoSession('learner', 'demo-tenant-1');
vi.mock('./session', () => ({ getSession: async () => current }));

const { getMyCertificate, getMyCertificates, getLearnerDashboard } = await import('./learner');
const { verifyCertificate } = await import('./verification');

// Fixed clock: 22 Oct 2026, 15:00 IST.
const NOW = new Date('2026-10-22T09:30:00.000Z');

async function list(role: RoleKey = 'learner', tenantId = 'demo-tenant-1') {
  current = buildDemoSession(role, tenantId);
  const result = await getMyCertificates({ now: NOW });
  if (!result.ok) throw new Error(`expected data, got ${result.status}`);
  return result.data;
}

describe('getMyCertificates (own awards only)', () => {
  it('lists only the learner’s own awards in the active tenant, newest first, with derived status', async () => {
    const data = await list();
    expect(data.data.map((c) => [c.courseTitle, c.status])).toEqual([
      ['First Aid Essentials (Demo)', 'valid'],
      ['First Aid Essentials (Demo)', 'superseded'],
      ['Chemical Handling (Demo)', 'valid'],
      ['Hot Work Permits (Demo)', 'revoked'],
      ['Electrical Isolation (Demo)', 'expired'],
    ]);
    expect(data.data.every((c) => c.awardId.startsWith('demo-tenant-1-demo-user-'))).toBe(true);
    expect(data.page).toEqual({ nextCursor: null, limit: 25 });
  });

  it('another tenant shows that tenant’s awards only', async () => {
    const data = await list('learner', 'demo-tenant-2');
    expect(data.data.every((c) => c.awardId.startsWith('demo-tenant-2-'))).toBe(true);
  });

  it('a session without a tenant is refused; demo states map to 403 / 500 / empty', async () => {
    current = buildDemoSession('platform_super_admin', null);
    expect(await getMyCertificates({ now: NOW })).toMatchObject({ status: 403 });
    current = buildDemoSession('learner', 'demo-tenant-1');
    expect(await getMyCertificates({ now: NOW, demoState: 'error' })).toMatchObject({
      status: 500,
    });
    expect(await getMyCertificates({ now: NOW, demoState: 'empty' })).toMatchObject({
      ok: true,
      data: { data: [] },
    });
  });

  it('the dashboard shows the current award (not the superseded one)', async () => {
    current = buildDemoSession('learner', 'demo-tenant-1');
    const dashboard = await getLearnerDashboard({ now: NOW });
    if (!dashboard.ok) throw new Error('expected data');
    const firstAid = dashboard.data.recentlyCompleted.find((c) =>
      c.courseTitle.startsWith('First Aid'),
    )!;
    expect(firstAid.certificate?.awardId).toBe('demo-tenant-1-demo-user-enr-07-cert-2');
  });
});

describe('getMyCertificate', () => {
  it("404s for someone else's, another tenant's or an unknown award in every demo state", async () => {
    current = buildDemoSession('learner', 'demo-tenant-1');
    for (const id of [
      'demo-tenant-1-demo-other-learner-enr-02-cert-1',
      'demo-tenant-2-demo-user-enr-07-cert-2',
      'demo-tenant-1-demo-user-enr-07-cert-9',
    ]) {
      for (const demoState of ['ready', 'error', 'forbidden'] as const) {
        expect(await getMyCertificate(id, { now: NOW, demoState })).toMatchObject({ status: 404 });
      }
    }
  });

  it('a superseded award points to its replacement; the holder sees their full name', async () => {
    current = buildDemoSession('learner', 'demo-tenant-1');
    const result = await getMyCertificate('demo-tenant-1-demo-user-enr-07-cert-1', { now: NOW });
    expect(result).toMatchObject({
      ok: true,
      data: {
        holderName: 'Demo User',
        issuerName: 'Example Manufacturing (Demo)',
        award: {
          status: 'superseded',
          replacedByAwardId: 'demo-tenant-1-demo-user-enr-07-cert-2',
        },
      },
    });
  });
});

describe('verifyCertificate (public, D-017)', () => {
  async function verificationIdOf(awardId: string) {
    current = buildDemoSession('learner', 'demo-tenant-1');
    const result = await getMyCertificate(awardId, { now: NOW });
    if (!result.ok) throw new Error('expected data');
    return result.data.award.verificationId;
  }

  it('shows only the D-017 fields, with a masked name', async () => {
    const id = await verificationIdOf('demo-tenant-1-demo-user-enr-07-cert-2');
    const result = await verifyCertificate(id.toLowerCase().replaceAll('-', ' '), { now: NOW });
    if (!result.ok) throw new Error('expected data');
    expect(Object.keys(result.data).sort()).toEqual(
      [
        'checkedAt',
        'courseTitle',
        'expiresOn',
        'holderMaskedName',
        'issuedOn',
        'issuerName',
        'revokedOn',
        'status',
        'verificationId',
      ].sort(),
    );
    expect(result.data).toMatchObject({
      verificationId: id,
      status: 'valid',
      holderMaskedName: 'D. U***',
      issuerName: 'Example Manufacturing (Demo)',
    });
    expect(JSON.stringify(result.data)).not.toMatch(/Demo User|demo-user|enr-/);
  });

  it('revoked shows the date but never the reason; expired and superseded are not valid', async () => {
    const revoked = await verifyCertificate(
      await verificationIdOf('demo-tenant-1-demo-user-enr-12-cert-1'),
      { now: NOW },
    );
    expect(revoked).toMatchObject({ ok: true, data: { status: 'revoked' } });
    if (!revoked.ok) throw new Error('expected data');
    expect(revoked.data.revokedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(JSON.stringify(revoked.data)).not.toContain(DEMO_REVOCATION_REASON);
    const expired = await verifyCertificate(
      await verificationIdOf('demo-tenant-1-demo-user-enr-11-cert-1'),
      { now: NOW },
    );
    expect(expired).toMatchObject({ ok: true, data: { status: 'expired' } });
    const superseded = await verifyCertificate(
      await verificationIdOf('demo-tenant-1-demo-user-enr-07-cert-1'),
      { now: NOW },
    );
    expect(superseded).toMatchObject({ ok: true, data: { status: 'superseded' } });
  });

  it('a malformed and an unknown id get the same 404', async () => {
    const malformed = await verifyCertificate('not-an-id', { now: NOW });
    const unknown = await verifyCertificate('VL-0000-0000-0000-0000', { now: NOW });
    expect(malformed).toEqual(unknown);
    expect(unknown).toMatchObject({ ok: false, status: 404 });
  });
});
