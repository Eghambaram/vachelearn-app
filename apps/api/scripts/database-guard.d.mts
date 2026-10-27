/** Why a database URL is refused for a destructive command, or null when it is a local dev/test database. */
export function refuseUnlessLocalDatabase(
  raw: string | undefined,
  options: { purpose: 'reset' | 'test' },
): string | null;
