# Legacy Migration Mapping

Migration is not assumed to be part of the first greenfield scaffold. Use this document if legacy data must be imported.

## Source materials
- `reference/legacy/001-AdminScreens.pdf`
- `reference/legacy/002-LearnnerScreens.pdf`
- `reference/legacy/003-Application ERD_merged.pdf`

## Mapping principles
- Profile source data before designing transformations.
- Map legacy tenant/portal concepts to the new Tenant/TenantDomain only after verifying business semantics.
- Map legacy users, roles, groups and mappings to explicit memberships, role assignments and group memberships.
- Map course/catalog records to Course and CourseVersion; preserve source identifiers in migration metadata.
- Reconcile learner progress, assessment attempts, certificates, audit history and timestamps.
- Do not silently discard custom fields or modules; profile their usage and obtain approval before retiring.
- Create exception reports for orphaned records, duplicate memberships, invalid ownership, inconsistent completion statuses and certificates without evidence.
- Run a dry-run import and reconcile counts plus sampled records before cutover.
