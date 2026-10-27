import { refuseUnlessLocalDatabase } from '../scripts/database-guard.mjs';

const ok = (raw: string, purpose: 'reset' | 'test') =>
  expect(refuseUnlessLocalDatabase(raw, { purpose })).toBeNull();
const refused = (raw: string | undefined, purpose: 'reset' | 'test', why: RegExp) =>
  expect(refuseUnlessLocalDatabase(raw, { purpose })).toMatch(why);

describe('database guard (db:reset, test setup)', () => {
  it('allows only the local dev database or a local "_test" database', () => {
    ok('postgresql://vachelearn:change-me@localhost:55432/vachelearn', 'reset');
    ok('postgresql://vachelearn:change-me@127.0.0.1:55432/vachelearn_test', 'reset');
    ok('postgres://vachelearn:change-me@[::1]:55432/vachelearn_test', 'test');
  });

  it('refuses a query string that could redirect the connection (Prisma honours ?host=)', () => {
    refused(
      'postgresql://u:p@localhost:55432/vachelearn?host=prod.example.com',
      'reset',
      /query parameters/,
    );
    refused(
      'postgresql://u:p@localhost:55432/vachelearn?hostaddr=10.0.0.5',
      'reset',
      /query parameters/,
    );
    refused(
      'postgresql://u:p@localhost/vachelearn?host=/cloudsql/project:region:db',
      'reset',
      /query parameters/,
    );
    refused(
      'postgresql://u:p@localhost:55432/vachelearn_test?sslmode=require',
      'test',
      /query parameters/,
    );
  });

  it('refuses remote and look-alike hosts', () => {
    refused('postgresql://u:p@db.example.com:5432/vachelearn', 'reset', /not localhost/);
    refused('postgresql://u:p@localhost.evil.com:5432/vachelearn', 'reset', /not localhost/);
    refused('postgresql://u:p@10.0.0.5:5432/vachelearn_test', 'test', /not localhost/);
  });

  it('refuses unexpected database names (a localhost tunnel to a remote server)', () => {
    refused('postgresql://u:p@localhost:5432/prod', 'reset', /not the local dev database/);
    refused('postgresql://u:p@localhost:55432/vachelearn', 'test', /not a test database/);
  });

  it('refuses missing, malformed and non-Postgres URLs', () => {
    refused(undefined, 'reset', /not set/);
    refused('not a url', 'reset', /not a valid URL/);
    refused('mysql://u:p@localhost/vachelearn', 'reset', /not postgresql/);
  });
});
