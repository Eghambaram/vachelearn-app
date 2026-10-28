import { safeErrorName, scrubSecrets } from '../logging/logging.module';

/*
 * What a failed job records in `last_error` and its log line (CLAUDE.md: never tokens, links, signed URLs, addresses or
 * payload values). Only the error's type and a scrubbed, truncated message are kept — never `cause`, `detail` or other
 * properties, which often carry row values. The same scrubber as every logged error (`scrubSecrets`).
 */

const MAX_LENGTH = 500;

export function sanitizeJobError(err: unknown): string {
  const name = err instanceof Error ? safeErrorName(err.name) : 'Error';
  const raw = err instanceof Error ? err.message : 'Non-error thrown';
  return `${name}: ${scrubSecrets(raw)}`.slice(0, MAX_LENGTH);
}
