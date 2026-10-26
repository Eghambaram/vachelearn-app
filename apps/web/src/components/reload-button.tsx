'use client';

import { useRouter } from 'next/navigation';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/** "Try again" for a server-rendered page whose load failed: asks the server to render the page again. */
export function ReloadButton() {
  const router = useRouter();
  return (
    <Button variant="outline" onClick={() => router.refresh()}>
      <RotateCw aria-hidden="true" />
      {t.states.retry}
    </Button>
  );
}
