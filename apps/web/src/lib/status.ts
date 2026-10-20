/**
 * Status vocabulary from docs/UI_UX_SPECIFICATION.md §Status vocabulary, with one tone per status.
 * Tones for statuses named in .claude/rules/web.md follow that rule; the rest are Proposed in the UI spec
 * (Slice 1.3a) and can be changed there and here together.
 */
export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral' | 'muted';

export const STATUS_VOCABULARY = {
  tenant: { active: 'success', suspended: 'danger', archived: 'muted', trial: 'warning' },
  course: { draft: 'neutral', under_review: 'warning', published: 'success', archived: 'muted' },
  enrollment: {
    not_started: 'neutral',
    in_progress: 'info',
    completed: 'success',
    overdue: 'danger',
    cancelled: 'muted',
    failed: 'danger',
    expired: 'danger',
  },
  attempt: { in_progress: 'info', submitted: 'info', passed: 'success', failed: 'danger' },
  certificate: { valid: 'success', expired: 'danger', revoked: 'danger', superseded: 'muted' },
  compliance: {
    compliant: 'success',
    due_soon: 'warning',
    overdue: 'danger',
    not_started: 'neutral',
    not_applicable: 'muted',
  },
  attendance: { present: 'success', absent: 'danger', late: 'warning', excused: 'muted' },
  order: {
    pending: 'muted',
    paid: 'success',
    failed: 'danger',
    cancelled: 'muted',
    refunded: 'muted',
    partially_refunded: 'warning',
  },
  job: {
    queued: 'info',
    running: 'info',
    succeeded: 'success',
    failed: 'danger',
    retrying: 'warning',
  },
} as const satisfies Record<string, Record<string, StatusTone>>;

export type StatusEntity = keyof typeof STATUS_VOCABULARY;
export type StatusOf<E extends StatusEntity> = keyof (typeof STATUS_VOCABULARY)[E] & string;

export function statusTone<E extends StatusEntity>(entity: E, status: StatusOf<E>): StatusTone {
  return (STATUS_VOCABULARY[entity] as Record<string, StatusTone>)[status]!;
}
