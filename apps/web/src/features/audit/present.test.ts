import type { AuditEventView } from '@vachelearn/contracts';
import { FILTER_ACTIONS, changes, reasonLine, record, who } from './present';

const ID = '01900000-0000-7000-8000-0000000000a1';
const base: AuditEventView = {
  id: ID,
  occurredAt: '2026-11-03T05:00:00.000Z',
  action: 'membership.updated',
  entityType: 'membership',
  entityId: ID,
  entityLabel: 'Asha (Demo)',
  actor: { kind: 'user', displayName: 'Ravi (Demo)' },
  branch: null,
  reason: null,
  before: null,
  after: null,
};

describe('audit entries in plain words (UX review 2.6a)', () => {
  it('names the record and the actor, never an id or an email', () => {
    expect(record(base)).toBe('Member · Asha (Demo)');
    expect(
      record({ ...base, entityType: 'role_assignment', entityLabel: 'instructor·Asha (Demo)' }),
    ).toBe('Role · Instructor · Asha (Demo)');
    expect(record({ ...base, entityLabel: null })).toBe('Member');
    expect(who({ ...base, actor: { kind: 'support', displayName: 'Sam', reason: 'T-1' } })).toBe(
      'VacheLearn support — Sam',
    );
    expect(who({ ...base, actor: { kind: 'system' } })).toBe('VacheLearn (system)');
  });

  it('turns recorded values into sentences and hides technical keys', () => {
    expect(
      changes({
        ...base,
        before: { employeeId: '[changed]', status: 'active', primaryBranchId: '[other branch]' },
        after: {
          employeeId: '[changed]',
          status: 'deactivated',
          primaryBranchId: ID,
          membershipId: ID,
        },
      }),
    ).toEqual([
      'Employee ID: changed (value not recorded)',
      'Status: Active → Deactivated',
      'Primary branch: another branch → changed',
    ]);
    expect(
      changes({
        ...base,
        action: 'support.accessed',
        after: { method: 'GET', route: 'PeopleController.get', permission: 'user.read' },
      }),
    ).toEqual([]);
  });

  it('explains support rows: the screen opened, why a session ended', () => {
    expect(
      reasonLine({
        ...base,
        action: 'support.accessed',
        after: { route: 'PeopleController.list' },
      }),
    ).toBe('Screen: Users');
    expect(reasonLine({ ...base, action: 'support_session.ended', reason: 'signed_out' })).toBe(
      'Ended because: the staff member signed out',
    );
    expect(reasonLine({ ...base, reason: 'Left the site' })).toBe('Reason: Left the site');
  });

  it('offers only actions that can appear in a tenant log', () => {
    expect(FILTER_ACTIONS).not.toContain('auth.signed_in');
    expect(FILTER_ACTIONS).toContain('membership.deactivated');
  });
});
