import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { isDemoWorkspacesEnabled } from '@/lib/dev-tools';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.publicSite.signIn };

// The demo gate (D-063) is read at request time, like /design, so one build serves both states.
export const dynamic = 'force-dynamic';

/** No sign-in form until authentication exists (slice 2.3): a form here would be an inert control. */
export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">{t.auth.signInTitle}</h1>
      <p className="text-muted-foreground">{t.auth.signInUnavailable}</p>
      {isDemoWorkspacesEnabled() ? (
        <Button asChild variant="outline" className="self-start">
          <Link href="/select-workspace">{t.publicSite.demo}</Link>
        </Button>
      ) : null}
    </>
  );
}
