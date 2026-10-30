'use client';

import { InlineAlert, useFocusOnChange } from '@/components/inline-alert';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/** "Support session ended", focused so the end of support mode is announced (UX review 2.4d). */
export function SupportEndedNotice() {
  const ref = useFocusOnChange<HTMLDivElement>(true);
  return (
    <InlineAlert ref={ref} tone="success" className="max-w-xl">
      {t.shell.supportEnded}
    </InlineAlert>
  );
}
