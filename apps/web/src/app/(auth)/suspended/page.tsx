import type { Metadata } from 'next';
import { PauseCircle } from 'lucide-react';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.system.suspendedTitle };

/** Shown when the active tenant is suspended (UI spec #56). Phase 2 redirects here from the API's tenant status. */
export default function SuspendedPage() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <PauseCircle aria-hidden="true" className="size-8 text-warning" />
      <h1 className="text-2xl font-semibold">{t.system.suspendedTitle}</h1>
      <p className="text-muted-foreground">{t.system.suspendedBody}</p>
    </div>
  );
}
