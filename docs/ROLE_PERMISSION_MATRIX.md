# Role & Permission Matrix — Initial Proposal

This matrix is a starting point; refine it with the product owner. Permissions must be enforced by API/domain services, not only by UI visibility.

| Capability | Platform Super Admin | Tenant Admin | Branch Admin | Learning Manager | Instructor | Learner | Compliance Viewer |
|---|---|---|---|---|---|---|---|
| Manage tenants | Platform-wide | No | No | No | No | No | No |
| Manage branches | Platform support only | Tenant-wide | Assigned branches | Assigned scope if granted | No | No | Read-only if granted |
| Manage tenant users | Platform support only | Tenant-wide | Assigned branches | Only if explicitly granted | No | Own profile only | Read-only scoped |
| Manage roles | Platform roles | Tenant roles within grant limits | No elevation | No elevation | No | No | No |
| Manage groups | Support as needed | Tenant-wide | Assigned branches | Assigned scope | No | No | Read-only if granted |
| Author courses | Platform library if supported | Tenant courses | If granted | If granted | Assigned courses if granted | No | No |
| Publish courses | Platform content if supported | Tenant-wide | If granted | If granted | No by default | No | No |
| Assign learning | Support as needed | Tenant-wide | Assigned branches | Assigned scope | Assigned cohorts if granted | Self-enroll if permitted | No |
| View own learning | No special self-view | Yes | Yes | Yes | Yes | Yes | No |
| View team progress | If authorized | Tenant-wide | Assigned branches | Assigned scope | Assigned learners | No | Read-only scoped |
| Grade/review assessments | Support if needed | Yes | If granted | If granted | Assigned courses | Own results only | Read-only if granted |
| Issue/revoke certificates | Platform support if granted | Tenant-wide | If granted | If granted | No by default | Download own | Read-only |
| Manage compliance | Platform metrics only | Tenant-wide | Assigned branches | Assigned scope | No | Own status only | Read-only scoped |
| Manage surveys/sessions | Platform support if needed | Tenant-wide | Assigned branches | Assigned scope | Assigned sessions | Respond/register | Read-only if granted |
| Manage orders/refunds | Platform billing scope | Tenant commerce scope | No by default | No by default | No | Own orders | No |
| Export reports | Platform scope | Tenant scope | Branch scope | Assigned scope | Assigned learners only | Own records only | Read-only assigned scope |
| View audit logs | Platform scope | Tenant scope | Scoped if granted | Scoped if granted | No by default | No | Scoped read-only |

## Rules
- Deny by default.
- Separate global user identity from tenant membership.
- A user can hold different roles in different tenants.
- Branch roles cannot expand scope by changing IDs or request parameters.
- Privilege elevation and platform role assignment require explicit platform permission.
- Log sensitive permission and membership changes.
