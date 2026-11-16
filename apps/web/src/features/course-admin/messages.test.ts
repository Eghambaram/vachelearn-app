import { describe, expect, it } from 'vitest';
import type { ApiResult } from '@/lib/api/client';
import { catalogErrorMessage, courseErrorMessage } from './messages';

type Failure = Extract<ApiResult<unknown>, { ok: false }>;
const failure = (
  status: number,
  code: string,
  fieldErrors?: { field: string; code: string; message: string }[],
): Failure => ({
  ok: false,
  status,
  error: { code, message: 'server text', requestId: 'r', fieldErrors },
});

describe('course admin messages', () => {
  it('category and tag refusals use our sentences, by kind', () => {
    const taken = failure(422, 'VALIDATION_FAILED', [
      { field: 'name', code: 'taken', message: 'x' },
    ]);
    expect(catalogErrorMessage('category')(taken)).toMatch(/already has a category/);
    expect(catalogErrorMessage('tag')(taken)).toMatch(/already has a tag/);
    expect(catalogErrorMessage('tag')(failure(409, 'CONFLICT'))).toMatch(/changed this meanwhile/);
    expect(catalogErrorMessage('category')(failure(404, 'NOT_FOUND'))).toMatch(
      /category is no longer/,
    );
  });

  it.each([
    [
      failure(422, 'VALIDATION_FAILED', [{ field: 'categoryId', code: 'archived', message: 'x' }]),
      /category is archived/,
    ],
    [
      failure(422, 'VALIDATION_FAILED', [{ field: 'categoryId', code: 'not_found', message: 'x' }]),
      /no longer available/,
    ],
    [
      failure(422, 'VALIDATION_FAILED', [{ field: 'tagIds', code: 'archived', message: 'x' }]),
      /archived tag/,
    ],
    [
      failure(422, 'VALIDATION_FAILED', [{ field: 'title', code: 'too_small', message: 'x' }]),
      /3 to 120/,
    ],
    [failure(409, 'CONFLICT'), /not saved/],
    [failure(409, 'COURSE_ARCHIVED'), /archived/],
    [failure(403, 'FORBIDDEN'), /permission/],
  ])('course refusal %#', (result, expected) => {
    expect(courseErrorMessage(result)).toMatch(expected);
    expect(courseErrorMessage(result)).not.toContain('server text');
  });
});
