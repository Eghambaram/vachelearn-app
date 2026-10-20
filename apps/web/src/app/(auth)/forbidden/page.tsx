import type { Metadata } from 'next';
import Link from 'next/link';
import { PermissionDenied } from '@/components/permission-denied';
import { Button } from '@/components/ui/button';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.system.forbiddenTitle };

/** System state for a 403 outside a workspace (UI spec #56). Reveals nothing about what was requested. */
export default function ForbiddenPage() {
  return (
    <PermissionDenied
      headingLevel="h1"
      title={t.system.forbiddenTitle}
      className="border-none p-0"
      action={
        <Button asChild variant="outline">
          <Link href="/">{t.system.home}</Link>
        </Button>
      }
    />
  );
}
