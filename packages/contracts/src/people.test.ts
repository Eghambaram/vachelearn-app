import { PeopleListQuery, UpdatePersonBody, UpdateTenantSettingsBody } from './people';

describe('people contracts (Slice 2.5a)', () => {
  it('member edits name the version, change something, and never carry a tenant or the account name (D-105)', () => {
    expect(UpdatePersonBody.safeParse({ version: 1 }).success).toBe(false);
    expect(UpdatePersonBody.safeParse({ version: 1, department: 'Line 1' }).success).toBe(true);
    expect(UpdatePersonBody.safeParse({ version: 1, department: null }).success).toBe(true);
    expect(
      UpdatePersonBody.safeParse({ version: 1, department: 'X', tenantId: crypto.randomUUID() })
        .success,
    ).toBe(false);
    expect(UpdatePersonBody.safeParse({ version: 1, displayName: 'New name' }).success).toBe(false);
    expect(UpdatePersonBody.safeParse({ version: 1, employeeId: 'E'.repeat(41) }).success).toBe(
      false,
    );
  });

  it('lists are bounded and sort only by allowlisted fields', () => {
    expect(PeopleListQuery.parse({})).toMatchObject({ sort: 'name', direction: 'asc', limit: 25 });
    expect(PeopleListQuery.safeParse({ limit: '101' }).success).toBe(false);
    expect(PeopleListQuery.safeParse({ sort: 'employeeId' }).success).toBe(false);
    expect(PeopleListQuery.safeParse({ tenantId: crypto.randomUUID() }).success).toBe(false);
  });

  it('tenant settings: canonical locale, IANA time zone, no slug change', () => {
    expect(UpdateTenantSettingsBody.parse({ version: 1, defaultLocale: 'en-in' })).toMatchObject({
      defaultLocale: 'en-IN',
    });
    expect(
      UpdateTenantSettingsBody.safeParse({ version: 1, defaultTimezone: 'Mars/Base' }).success,
    ).toBe(false);
    expect(UpdateTenantSettingsBody.safeParse({ version: 1, slug: 'other' }).success).toBe(false);
  });
});
