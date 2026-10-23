'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/**
 * A completion action whose write arrives in Phase 4 (POST …/lessons/:id/complete or …/acknowledge). It says so
 * instead of faking success: nothing changes and the lesson stays as the server reported it (D-069,
 * Confirmed by the product owner).
 */
export function NotConnectedAction({ label }: { label: string }) {
  const [pressed, setPressed] = React.useState(false);
  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" onClick={() => setPressed(true)}>
        <Check aria-hidden="true" />
        {label}
      </Button>
      <p role="status" className="text-sm font-medium text-warning">
        {pressed ? t.player.notConnected : ''}
      </p>
    </div>
  );
}
