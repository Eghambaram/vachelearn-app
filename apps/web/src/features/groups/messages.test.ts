import { groupErrorMessage } from './messages';

const failure = (
  status: number,
  code: string,
  fieldErrors?: { field: string; code: string; message: string }[],
) => ({
  ok: false as const,
  status,
  error: { code, message: 'server text that must never be shown', requestId: 'req_1', fieldErrors },
});

describe('group error copy', () => {
  it('maps every group refusal to our own sentence, never the server text', () => {
    const cases: [ReturnType<typeof failure>, RegExp][] = [
      [
        failure(422, 'VALIDATION_FAILED', [{ field: 'name', code: 'taken', message: 'x' }]),
        /already has this name/,
      ],
      [
        failure(422, 'VALIDATION_FAILED', [
          { field: 'membershipIds', code: 'deactivated', message: 'x' },
        ]),
        /Deactivated members/,
      ],
      [failure(409, 'GROUP_ARCHIVED'), /archived/],
      [failure(409, 'BRANCH_INACTIVE'), /branch is inactive/],
      [failure(403, 'OUTSIDE_BRANCH_SCOPE'), /Ask a Tenant Admin/],
      [failure(409, 'CONFLICT'), /changed this group meanwhile/],
      [failure(409, 'INVALID_STATE'), /no longer applies/],
      [failure(404, 'NOT_FOUND'), /no longer available/],
      [failure(403, 'FORBIDDEN'), /permission/],
      [failure(403, 'SUPPORT_READ_ONLY'), /read-only/],
      [
        failure(422, 'VALIDATION_FAILED', [
          { field: 'description', code: 'too_big', message: 'x' },
        ]),
        /highlighted fields/,
      ],
    ];
    for (const [result, text] of cases) {
      const message = groupErrorMessage(result);
      expect(message).toMatch(text);
      expect(message).not.toContain('server text');
    }
  });
});
