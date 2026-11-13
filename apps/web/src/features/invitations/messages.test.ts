import { acceptErrorMessage, invitationErrorMessage } from './messages';

const failure = (status: number, code: string) => ({
  ok: false as const,
  status,
  error: { code, message: 'server text that must never be shown', requestId: 'req_1' },
});

describe('invitation error copy', () => {
  it('maps every invitation refusal to our own sentence, never the server text', () => {
    const cases: [number, string, RegExp][] = [
      [409, 'ALREADY_MEMBER', /already a member/],
      [409, 'INVITATION_PENDING', /pending invitation/],
      [409, 'CANNOT_INVITE', /cannot be invited/],
      [409, 'INVALID_STATE', /already accepted or cancelled/],
      [404, 'NOT_FOUND', /could not be found/],
      [403, 'FORBIDDEN', /cannot invite with this role/],
      [422, 'VALIDATION_FAILED', /highlighted fields/],
    ];
    for (const [status, code, text] of cases) {
      const message = invitationErrorMessage(failure(status, code));
      expect(message).toMatch(text);
      expect(message).not.toContain('server text');
    }
  });

  it('maps acceptance refusals', () => {
    expect(acceptErrorMessage(failure(400, 'INVALID_LINK'))).toMatch(/invalid, used or expired/);
    expect(acceptErrorMessage(failure(409, 'SIGN_IN_REQUIRED'))).toMatch(/Sign in as it/);
    expect(acceptErrorMessage(failure(403, 'WRONG_ACCOUNT'))).toMatch(/different address/);
    expect(acceptErrorMessage(failure(429, 'RATE_LIMITED'))).not.toContain('server text');
  });
});
