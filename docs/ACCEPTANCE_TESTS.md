# Acceptance Tests — Release Gates

## Tenant isolation
- Create Tenant A and Tenant B; cross-tenant reads/writes fail.
- Branch-scoped users cannot read other branches by changing IDs, filters, cursors or export URLs.
- Tenant suspension blocks access and new purchase/enrollment while retaining history.
- Role changes and membership changes are audited.

## Invitations and roles
- Invitation is single-use, expiring and bound to intended tenant/email.
- Replay, expired invitation and tenant mismatch fail.
- Existing membership is not overwritten when another invitation is accepted.
- User cannot elevate their own role or assign permissions beyond their authority.

## Courses and versioning
- Draft is not publicly assignable unless preview policy permits.
- Publishing validates required metadata/content and creates immutable version.
- Editing published course creates new draft/version.
- Existing enrollments remain tied to their enrolled version unless explicitly migrated.
- Archived course cannot receive new enrollments but retains history.

## Assignments and progress
- Assignment to a group validates tenant/scope.
- Retried assignment fan-out does not create duplicates.
- Group membership change behavior follows documented policy.
- Progress survives refresh, logout/login and device change.
- Lesson open does not automatically complete unless configured.

## Assessments and certificates
- Server computes score and pass/fail.
- Attempt limits and time limits are enforced server-side.
- Retakes preserve previous attempts.
- Certificate only issues when completion policy is met.
- Duplicate events do not create duplicate certificates.
- Public verification exposes minimal information and shows revocation/expiry accurately.

## Compliance and reports
- Due-soon/overdue/expiry boundary dates have tests.
- Branch-scoped reports and exports exclude other branches.
- CSV export matches on-screen filters and protects against formula injection.
- Report totals reconcile with source records.

## Surveys and classroom
- Survey audience, open/close period and required fields are enforced.
- Anonymous mode does not directly store respondent identity in response payload.
- Session capacity, times and instructor scope are validated.
- Attendance changes are audited and affect completion only under the configured policy.

## Commerce
- Fake browser success cannot grant enrollment.
- Webhook signature is verified and duplicate events are ignored.
- Amount/currency are server-calculated.
- Raw card data is never stored.
- Refund behavior follows explicit policy and preserves learning evidence.

## Required end-to-end journey
1. Create two tenants and branches.
2. Invite branch-scoped learner.
3. Publish a versioned course.
4. Assign it to a group.
5. Learner completes lessons and passes assessment.
6. Certificate is issued once and downloadable.
7. Compliance/report data agrees with learning records.
8. Tenant and branch isolation tests pass.
9. Classroom attendance and survey workflows pass when enabled.
10. Paid enrollment is granted only after verified payment when commerce is enabled.
