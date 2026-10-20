# VacheLearn Domain Model — Initial Proposal

> **Pre-Phase-0 draft (kit v1.0), not yet reconciled.** Phase 0 rewrites this file. Until then `MASTER_PROMPT.md`
> wins on conflicts — notably, auth sessions are `AuthSession` and classroom sessions are `ClassSession`; the
> `Session` entries below predate that rename.

## Main entity groups

### Tenancy and identity
Tenant, Branch, Department, TenantDomain, TenantSetting, User, Membership, BranchMembership, Role, Permission, RoleAssignment, Invitation, Session.

### Groups and targeting
Group, GroupMember, Assignment, AssignmentTarget.

### Content
Course, CourseVersion, Module, Lesson, Asset, Category, Tag, ContentProviderRef.

### Learning evidence
Enrollment, LearningProgress, LearningEvent, Assessment, AssessmentVersion, Question, QuestionOption, Attempt, Answer, GradingResult.

### Certificates and compliance
CertificateTemplate, CertificateAward, TrainingRequirement, RequirementApplicability, ComplianceEvidence.

### Surveys and classroom
Survey, SurveyVersion, SurveyQuestion, SurveyResponse, SurveyAnswer, Session, SessionEnrollment, AttendanceRecord, InstructorAssignment, Venue/MeetingLink.

### Commerce and reporting
Offer, Price, Order, OrderLine, PaymentAttempt, Refund, ProviderEvent, SavedReport, ReportRun, ReportExport, MetricDefinition, AuditEvent.

## Conceptual relationship diagram

```mermaid
erDiagram
  TENANT ||--o{ BRANCH : contains
  USER ||--o{ MEMBERSHIP : has
  TENANT ||--o{ MEMBERSHIP : grants
  MEMBERSHIP ||--o{ BRANCH_MEMBERSHIP : scopes
  BRANCH ||--o{ BRANCH_MEMBERSHIP : grants
  TENANT ||--o{ GROUP : owns
  GROUP ||--o{ GROUP_MEMBER : contains
  USER ||--o{ GROUP_MEMBER : joins
  TENANT ||--o{ COURSE : owns
  COURSE ||--o{ COURSE_VERSION : versions
  COURSE_VERSION ||--o{ MODULE : contains
  MODULE ||--o{ LESSON : contains
  TENANT ||--o{ ASSIGNMENT : creates
  ASSIGNMENT ||--o{ ENROLLMENT : produces
  USER ||--o{ ENROLLMENT : learner
  COURSE_VERSION ||--o{ ENROLLMENT : version
  ENROLLMENT ||--o{ LEARNING_PROGRESS : records
  COURSE_VERSION ||--o{ ASSESSMENT : includes
  ASSESSMENT ||--o{ ATTEMPT : has
  USER ||--o{ ATTEMPT : takes
  USER ||--o{ CERTIFICATE_AWARD : receives
  COURSE_VERSION ||--o{ CERTIFICATE_AWARD : evidence
  TENANT ||--o{ TRAINING_REQUIREMENT : defines
  TENANT ||--o{ SESSION : schedules
  SESSION ||--o{ ATTENDANCE_RECORD : records
  TENANT ||--o{ ORDER : owns
  ORDER ||--o{ PAYMENT_ATTEMPT : has
```

## Integrity rules
- Use stable UUID primary keys for new records unless external provider requirements differ.
- Enforce foreign keys and unique constraints for tenant ownership and memberships.
- Tenant-owned records must have an auditable tenant ownership path.
- Branch-scoped access must be represented explicitly.
- Published course and assessment versions are immutable.
- Store timestamps in UTC.
- Preserve historical progress, attempts, awards, attendance and payment events.
- Do not blindly map legacy `custom0`–`custom4` or generic JSON access fields into the new domain model; profile usage first.
- This is a conceptual model; finalize physical schema and migrations during implementation.
