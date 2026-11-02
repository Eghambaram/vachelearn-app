import { peopleErrorMessage } from './messages';

const fail = (
  status: number,
  code: string,
  fieldErrors?: { field: string; code: string; message: string }[],
) => ({
  ok: false as const,
  status,
  error: { code, message: 'server text', requestId: 'req_1', fieldErrors },
});

describe('people error copy (never the server’s text)', () => {
  it('maps the API codes to our sentences', () => {
    expect(peopleErrorMessage(fail(403, 'OUTSIDE_BRANCH_SCOPE'))).toMatch(/Ask a Tenant Admin/);
    expect(peopleErrorMessage(fail(409, 'LAST_TENANT_ADMIN'))).toMatch(/at least one Tenant Admin/);
    expect(peopleErrorMessage(fail(409, 'BRANCH_HAS_ROLE'))).toBe(
      'Revoke their roles on this branch first.',
    );
    expect(peopleErrorMessage(fail(409, 'CONFLICT'))).toMatch(/Reload the page/);
    expect(
      peopleErrorMessage(
        fail(422, 'VALIDATION_FAILED', [{ field: 'employeeId', code: 'taken', message: 'x' }]),
      ),
    ).toMatch(/employee ID/);
  });

  it('never shows the server message for unknown codes', () => {
    expect(peopleErrorMessage(fail(500, 'INTERNAL'))).not.toContain('server text');
  });
});
