import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Building2, Headset, PauseCircle, PlayCircle, Archive, UserPlus } from 'lucide-react';
import type { PlatformActivity, PlatformActivityAction } from '@vachelearn/contracts';
import { DemoBadge } from '@/components/demo-badge';
import { EmptyState } from '@/components/empty-state';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatDateTime } from '@/lib/format';
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

/** Latest platform audit events: who did what, to which tenant, when (zone shown). */
export function ActivityFeed({
  events,
  timeZone,
  demo,
}: {
  events: readonly PlatformActivity[];
  timeZone: string;
  demo: boolean;
}) {
  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto]">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">{a.title}</h2>
          {demo ? <DemoBadge /> : null}
        </div>
        <Link
          href="/platform/audit"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {a.viewAll}
        </Link>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <EmptyState headingLevel="h3" title={a.emptyTitle} />
        ) : (
          <ol className="flex flex-col divide-y">
            {events.map((event) => {
              const Icon = ICONS[event.action];
              return (
                <li key={event.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-neutral-700"
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                    <p>
                      <span className="font-medium">{event.actorDisplayName}</span>{' '}
                      {a.actions[event.action]}
                      {event.tenant ? (
                        <>
                          {' '}
                          <span className="font-medium">{event.tenant.displayName}</span>
                        </>
                      ) : null}
                    </p>
                    <time dateTime={event.occurredAt} className="text-xs text-muted-foreground">
                      {formatDateTime(event.occurredAt, { timeZone })}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
