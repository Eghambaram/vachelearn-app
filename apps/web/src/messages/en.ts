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
  breadcrumbs: {
    label: 'Breadcrumb',
    more: 'More pages',
  },
  demo: {
    badge: 'Demo',
    title: 'Demo data — not real figures',
  },
  states: {
    emptyTitle: 'Nothing here yet',
    errorTitle: 'This could not be loaded',
    errorDescription: 'Try again. If it keeps happening, contact support with the reference below.',
    errorReference: 'Reference',
    retry: 'Try again',
    deniedTitle: 'You do not have access to this',
    deniedDescription:
      'Your role does not include this. Ask an administrator in your organisation if you need access.',
  },
  kpi: {
    increase: 'Up',
    decrease: 'Down',
    unchanged: 'No change',
  },
  chart: {
    viewsLabel: 'Choose how to show this data',
    chart: 'Chart',
    table: 'Table',
    summary: 'Summary',
    emptyTitle: 'No data for this period',
    emptyDescription: 'The chart appears once there is data to show.',
  },
  table: {
    actionsColumn: 'Actions',
    rowActions: (row: string) => `Actions for ${row}`,
    selectAll: 'Select all rows on this page',
    selectRow: (row: string) => `Select ${row}`,
    selected: (count: number) => `${count} selected`,
    clearSelection: 'Clear selection',
    loadingRows: 'Loading rows…',
  },
  pagination: {
    label: 'Pagination',
    previous: 'Previous page',
    next: 'Next page',
    rowsPerPage: 'Rows per page',
    page: (page: number) => `Page ${page}`,
  },
  filterBar: {
    label: 'Search and filter',
    search: 'Search',
    clear: 'Clear filters',
    active: (count: number) => (count === 1 ? '1 filter applied' : `${count} filters applied`),
  },
  stepper: {
    label: 'Progress',
    complete: 'completed',
    current: 'current step',
    upcoming: 'not started',
    error: 'needs attention',
    stepOf: (step: number, total: number) => `Step ${step} of ${total}`,
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
