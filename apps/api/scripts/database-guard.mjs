// One guard for every command that may destroy or rewrite data (`db:reset`, the test suite's migrations and, later,
// fixtures that truncate tables): it may only ever touch a local dev or test database (.claude/rules/database.md).
//
// Prisma connects to a `host`/`hostaddr` query parameter in preference to the URL's host (e.g. Cloud SQL socket URLs
// look like `postgresql://u:p@localhost/db?host=/cloudsql/...`), so the hostname alone proves nothing: any query
// string is refused. A localhost tunnel to a remote server would still pass the host check, hence the database-name
// allowlist and, for resets, an explicit opt-in (security review, Slice 2.1).

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const DEV_DATABASE = 'vachelearn';

/**
 * @param {string | undefined} raw a PostgreSQL connection URL
 * @param {{ purpose: 'reset' | 'test' }} options `test` requires a database whose name ends in "_test"
 * @returns {string | null} why the URL is refused, or null when it is a local dev/test database
 */
export function refuseUnlessLocalDatabase(raw, { purpose }) {
  if (!raw) return 'DATABASE_URL is not set';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return 'the database URL is not a valid URL';
  }
  if (!['postgresql:', 'postgres:'].includes(url.protocol))
    return 'the database URL is not postgresql://';
  if (!LOCAL_HOSTS.has(url.hostname)) return `host "${url.hostname}" is not localhost`;
  if (url.search)
    return 'the database URL has query parameters (they can redirect the connection elsewhere)';
  const name = decodeURIComponent(url.pathname.slice(1));
  if (purpose === 'test') {
    if (!name.endsWith('_test'))
      return `database "${name}" is not a test database (name must end in "_test")`;
  } else if (name !== DEV_DATABASE && !name.endsWith('_test')) {
    return `database "${name}" is not the local dev database "${DEV_DATABASE}" or a "_test" database`;
  }
  return null;
}
