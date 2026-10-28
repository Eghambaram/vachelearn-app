/*
 * Database constraint errors mapped to API errors (api rules: a unique violation is a 409/422 with a field error, never
 * a 500). Through the `pg` driver adapter Prisma reports P2002 with the violated constraint's exact name in
 * `meta.driverAdapterError.cause.constraint.index`; matching the exact name means a future constraint on a similarly
 * named column (`country_code` vs `code`) can never be mistaken for this one.
 */

type PrismaLikeError = {
  code?: string;
  meta?: { driverAdapterError?: { cause?: { constraint?: { index?: unknown } } } };
};

/** True when `err` is a unique violation of the named constraint, e.g. `tenants_slug_key`. */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  const e = err as PrismaLikeError;
  return e?.code === 'P2002' && e.meta?.driverAdapterError?.cause?.constraint?.index === constraint;
}
