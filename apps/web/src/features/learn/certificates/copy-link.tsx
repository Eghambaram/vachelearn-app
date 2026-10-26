'use client';

import * as React from 'react';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/** Copies the public verification URL (built from this site's origin) and says whether it worked. */
export function CopyLink({ path }: { path: string }) {
  const [message, setMessage] = React.useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
      setMessage(t.certificates.copied);
    } catch {
      setMessage(t.certificates.copyFailed);
    }
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" onClick={copy}>
        <Link2 aria-hidden="true" />
        {t.certificates.copyLink}
      </Button>
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  );
}
