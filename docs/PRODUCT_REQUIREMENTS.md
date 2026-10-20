# VacheLearn Product Requirements

## Product vision
VacheLearn is a multi-tenant industrial learning and workforce-readiness platform. It enables organizations to manage people and branches, deliver training, assess competency, issue certificates, and track mandatory compliance.

**Product journey:** Learn → Practice → Prove → Certify → Improve.

## User groups
- Platform Super Admin
- Tenant Admin
- Branch Admin
- Learning Manager
- Instructor/Trainer
- Learner
- Compliance Viewer/Auditor

## Capability scope
1. Multi-tenant and branch management.
2. Users, groups, invitations, memberships, roles and permissions.
3. Course catalog, content authoring and versioning.
4. Assignments, enrollments and learning progress.
5. Learner dashboard and course player.
6. Assessments, attempts and scoring.
7. Completion certificates and verification.
8. Compliance requirements and basic progress reports.
9. Surveys and feedback.
10. Classroom/instructor-led sessions and attendance.
11. Commerce and paid enrollment.
12. Advanced analytics and custom reports.

## Initial product principles
- Security and tenant isolation are foundational.
- Published learning content and assessment versions are immutable.
- Learning evidence is historical and auditable.
- Payment state is separate from learning entitlement.
- UI screens must be connected to persisted workflows before a feature is called complete.
- Start with a modular monolith; do not introduce microservices without evidence.
- Build in vertical slices and test each phase.

## MVP boundary
Prioritize the core learning lifecycle: tenant setup → users → course authoring → assignment/enrollment → learner player → assessment → completion → certificate → report. Add surveys and classroom operations next. Add commerce and advanced analytics after core learning evidence is reliable.

## Explicitly out of scope until separately approved
- Claims of SCORM/xAPI support without implementation and conformance tests.
- Arbitrary SQL in custom reporting.
- Storing raw card data.
- Full microservices architecture.
- Automatically reproducing every legacy table or screen.
