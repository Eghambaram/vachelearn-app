'use client';

import { InlineAlert, useFocusOnChange } from '@/components/inline-alert';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/** After removing a member from the caller's last shared branch: why they are back on the list (UX review 2.5b). */
export function RemovedNotice() {
  const ref = useFocusOnChange<HTMLDivElement>(true);
  return (
    <InlineAlert ref={ref} tone="success" className="max-w-2xl">
      {t.people.removedNotice}
    </InlineAlert>
  );
}
