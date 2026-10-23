'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/**
 * An action whose write arrives in Phase 4 (e.g. POST …/lessons/:id/complete, …/attempts). It says so instead of
 * faking success: nothing changes and the page stays as the server reported it (D-069, D-071, Confirmed by the
 * product owner).
 */
export function NotConnectedAction({
  label,
  message = t.player.notConnected,
  icon = <Check aria-hidden="true" />,
}: {
  label: string;
  message?: string;
  icon?: React.ReactNode;
}) {
  const [pressed, setPressed] = React.useState(false);
  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" onClick={() => setPressed(true)}>
        {icon}
        {label}
      </Button>
      <p role="status" className="text-sm font-medium text-warning">
        {pressed ? message : ''}
      </p>
    </div>
  );
}
