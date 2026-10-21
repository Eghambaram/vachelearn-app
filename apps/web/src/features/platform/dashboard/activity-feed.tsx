import type { LucideIcon } from 'lucide-react';
import { Archive, Building2, Headset, PauseCircle, PlayCircle, UserPlus } from 'lucide-react';
import type { PlatformActivity, PlatformActivityAction } from '@vachelearn/contracts';
import { ActivityFeed } from '@/components/activity-feed';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const a = t.platformDashboard.activity;

const ICONS: Record<PlatformActivityAction, LucideIcon> = {
  'tenant.created': Building2,
  'tenant.suspended': PauseCircle,
  'tenant.reactivated': PlayCircle,
  'tenant.archived': Archive,
  'platform_user.invited': UserPlus,
  'support_session.started': Headset,
};

/** Latest platform audit events: who did what, to which tenant, when. */
export function PlatformActivityFeed({
  events,
  timeZone,
  demo,
}: {
  events: readonly PlatformActivity[];
  timeZone: string;
  demo: boolean;
}) {
  return (
    <ActivityFeed
      title={a.title}
      demo={demo}
      timeZone={timeZone}
      emptyTitle={a.emptyTitle}
      viewAll={{ href: '/platform/audit', label: a.viewAll }}
      items={events.map((event) => {
        const Icon = ICONS[event.action];
        return {
          id: event.id,
          occurredAt: event.occurredAt,
          icon: <Icon />,
          content: (
            <>
              <span className="font-medium">{event.actorDisplayName}</span>{' '}
              {a.actions[event.action]}
              {event.tenant ? (
                <>
                  {' '}
                  <span className="font-medium">{event.tenant.displayName}</span>
                </>
              ) : null}
            </>
          ),
        };
      })}
    />
  );
}
