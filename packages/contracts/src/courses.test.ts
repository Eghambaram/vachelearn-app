import { CourseListPage, CourseListQuery } from './courses';

describe('CourseListQuery', () => {
  it('defaults to newest first, 25 per page', () => {
    expect(CourseListQuery.parse({})).toEqual({ sort: 'updatedAt', direction: 'desc', limit: 25 });
  });

  it('coerces a string limit and enforces 1..100', () => {
    expect(CourseListQuery.parse({ limit: '50' }).limit).toBe(50);
    expect(CourseListQuery.safeParse({ limit: 101 }).success).toBe(false);
    expect(CourseListQuery.safeParse({ limit: 0 }).success).toBe(false);
  });

  it('only sorts by allowlisted fields', () => {
    expect(CourseListQuery.safeParse({ sort: 'title' }).success).toBe(true);
    expect(CourseListQuery.safeParse({ sort: 'tenantId' }).success).toBe(false);
  });

  it('rejects unknown parameters, including tenantId (tenant comes from the session)', () => {
    expect(CourseListQuery.safeParse({ tenantId: 'other' }).success).toBe(false);
  });

  it('rejects unknown status values ("under_review" needs D-022)', () => {
    expect(CourseListQuery.safeParse({ status: 'under_review' }).success).toBe(false);
  });

  it('bounds the search text', () => {
    expect(CourseListQuery.safeParse({ search: 'x'.repeat(101) }).success).toBe(false);
    expect(CourseListQuery.parse({ search: '  fire  ' }).search).toBe('fire');
  });
});

describe('CourseListPage', () => {
  it('matches the list envelope', () => {
    const page = { data: [], page: { nextCursor: null, limit: 25 } };
    expect(CourseListPage.parse(page)).toEqual(page);
    expect(CourseListPage.safeParse({ data: [] }).success).toBe(false);
  });
});
