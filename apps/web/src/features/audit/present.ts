import type { AuditEventView } from '@vachelearn/contracts';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const a = t.auditLog;

/*
 * Plain words for an audit entry (UX review 2.6a): who, what, which record, and the recorded changes — never raw keys,
 * handler names, codes or ids. Values the API stored as "[changed]" (personal) or "[other branch]" (out of scope) say
 * so; an id with no name (a job role or branch reference) is shown as "changed".
 */

/** Keys shown elsewhere (branch, record) or of no use to a tenant admin. */
const HIDDEN = new Set([
  'method',
  'route',
  'permission',
  'code',
  'membershipId',
  'userId',
  'branchId',
  'switched',
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function who(event: AuditEventView) {
  switch (event.actor.kind) {
    case 'system':
      return a.system;
    case 'support':
      return a.support(event.actor.displayName);
    case 'staff':
      return a.staff(event.actor.displayName);
    default:
      return event.actor.displayName;
  }
}

/** "Member · Asha", "Role · Instructor · Asha", "Branch · Pune Plant" — or the record type alone. */
export function record(event: AuditEventView) {
  const type = a.entities[event.entityType] ?? a.entities.record!;
  if (!event.entityLabel) return type;
  if (event.entityType === 'role_assignment') {
    const [role, name] = event.entityLabel.split('·');
    const roleName = (t.roles as Record<string, string>)[role ?? ''] ?? role;
    return `${type} · ${roleName}${name ? ` · ${name}` : ''}`;
  }
  return `${type} · ${event.entityLabel}`;
}

function value(key: string, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return a.empty;
  if (raw === '[changed]') return a.notRecorded;
  if (raw === '[other branch]') return a.otherBranch;
  if (key === 'role') return (t.roles as Record<string, string>)[String(raw)] ?? String(raw);
  if (key === 'status') return a.statuses[String(raw)] ?? String(raw);
  if (typeof raw === 'string' && UUID.test(raw)) return a.changed;
  if (typeof raw === 'string') return raw.replaceAll('_', ' ');
  return typeof raw === 'object' ? a.changed : String(raw);
}

/** The recorded changes as sentences: "Status: Active → Deactivated", "Employee ID: changed (value not recorded)". */
export function changes(event: AuditEventView): string[] {
  const before = event.before ?? {};
  const after = event.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => !HIDDEN.has(key),
  );
  return keys.map((key) => {
    const label = a.fields[key] ?? key;
    if (before[key] === '[changed]' || after[key] === '[changed]') {
      return a.set(label, a.notRecorded);
    }
    return key in before
      ? a.change(label, value(key, before[key]), value(key, after[key]))
      : a.set(label, value(key, after[key]));
  });
}

/** The reason line: support ends say why the session ended; a support row's screen; otherwise the recorded reason. */
export function reasonLine(event: AuditEventView): string | null {
  if (event.action === 'support_session.ended' || event.action === 'support_session.expired') {
    return event.reason ? a.endedBecause(a.endReasons[event.reason] ?? a.endReasons.other!) : null;
  }
  if (event.action === 'support.accessed' || event.action === 'support.denied') {
    const route = typeof event.after?.route === 'string' ? event.after.route : '';
    return a.screen(a.screens[route] ?? a.screens.other!);
  }
  return event.reason ? a.reason(event.reason) : null;
}

/** Actions that can appear in a tenant's log (sign-ins and password changes are not tenant events). */
export const FILTER_ACTIONS = Object.keys(a.actions).filter(
  (action) =>
    !['auth.signed_in', 'auth.signed_out', 'auth.password_set', 'auth.password_reset'].includes(
      action,
    ),
);
