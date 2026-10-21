import type { LucideIcon } from 'lucide-react';
import { Award, BookCheck, ClipboardList, GraduationCap, UserPlus, Users } from 'lucide-react';
import type { TenantActivity, TenantActivityAction } from '@vachelearn/contracts';
import { ActivityFeed } from '@/components/activity-feed';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const a = t.tenantDashboard.activity;

const ICONS: Record<TenantActivityAction, LucideIcon> = {
  'membership.activated': UserPlus,
  'course.published': BookCheck,
  'enrollment.completed': GraduationCap,
  'certificate.issued': Award,
  'group.created': Users,
  'assignment.created': ClipboardList,
};

export function TenantActivityFeed({
  events,
  timeZone,
  demo,
  canViewAuditLog,
}: {
  events: readonly TenantActivity[];
  timeZone: string;
  demo: boolean;
  /** `audit.read` — the link is shown only to roles that can open the audit log. */
  canViewAuditLog: boolean;
}) {
  return (
    <ActivityFeed
      title={a.title}
      demo={demo}
      timeZone={timeZone}
      emptyTitle={a.emptyTitle}
      viewAll={canViewAuditLog ? { href: '/admin/audit', label: a.viewAll } : undefined}
      items={events.map((event) => {
        const Icon = ICONS[event.action];
        return {
          id: event.id,
          occurredAt: event.occurredAt,
          icon: <Icon />,
          content: (
            <>
              <span className="font-medium">{event.actorDisplayName}</span>{' '}
              {a.actions[event.action]} <span className="font-medium">{event.subject}</span>
            </>
          ),
        };
      })}
    />
  );
}
