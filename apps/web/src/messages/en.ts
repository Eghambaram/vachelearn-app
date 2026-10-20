import type { StatusEntity, StatusOf } from '@/lib/status';

/**
 * English UI strings for shared components. Components take visible text as props and fall back to these defaults.
 * Slice 1.4 routes this object through the i18n helper (D-028); until then it is the single place to change copy.
 */
export const en = {
  common: {
    close: 'Close',
    cancel: 'Cancel',
    loading: 'Loading…',
    required: 'required',
    optional: 'optional',
  },
  combobox: {
    placeholder: 'Select an option',
    searchPlaceholder: 'Search…',
    empty: 'No matching options',
  },
  datePicker: {
    placeholder: 'Pick a date',
  },
  status: {
    tenant: { active: 'Active', suspended: 'Suspended', archived: 'Archived', trial: 'Trial' },
    course: {
      draft: 'Draft',
      under_review: 'Under Review',
      published: 'Published',
      archived: 'Archived',
    },
    enrollment: {
      not_started: 'Not Started',
      in_progress: 'In Progress',
      completed: 'Completed',
      overdue: 'Overdue',
      cancelled: 'Cancelled',
      failed: 'Failed',
      expired: 'Expired',
    },
    attempt: {
      in_progress: 'In Progress',
      submitted: 'Submitted',
      passed: 'Passed',
      failed: 'Failed',
    },
    certificate: {
      valid: 'Valid',
      expired: 'Expired',
      revoked: 'Revoked',
      superseded: 'Superseded',
    },
    compliance: {
      compliant: 'Compliant',
      due_soon: 'Due Soon',
      overdue: 'Overdue',
      not_started: 'Not Started',
      not_applicable: 'Not Applicable',
    },
    attendance: { present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused' },
    order: {
      pending: 'Pending',
      paid: 'Paid',
      failed: 'Failed',
      cancelled: 'Cancelled',
      refunded: 'Refunded',
      partially_refunded: 'Partially Refunded',
    },
    job: {
      queued: 'Queued',
      running: 'Running',
      succeeded: 'Succeeded',
      failed: 'Failed',
      retrying: 'Retrying',
    },
  } satisfies { [E in StatusEntity]: Record<StatusOf<E>, string> },
} as const;

export type Messages = typeof en;
