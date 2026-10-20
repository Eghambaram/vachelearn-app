import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { isDemoWorkspacesEnabled } from '@/lib/dev-tools';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

// The demo gate (D-063) is read at request time, like /design, so one build serves both states.
export const dynamic = 'force-dynamic';

/** Marketing landing (UI spec #1): layout only in 1.4; content in Phase 7 once approved copy exists (D-038). */
export default function HomePage() {
  return (
    <section className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 sm:py-24">
      <p className="rounded-md bg-warning-subtle px-2 py-1 text-xs font-medium text-warning">
        {t.publicSite.placeholderNote}
      </p>
      <h1 className="max-w-3xl text-4xl font-semibold sm:text-5xl">{t.publicSite.heroTitle}</h1>
      <p className="max-w-2xl text-lg text-muted-foreground">{t.publicSite.heroBody}</p>
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/login">{t.publicSite.signIn}</Link>
        </Button>
        {isDemoWorkspacesEnabled() ? (
          <Button asChild size="lg" variant="outline">
            <Link href="/select-workspace">{t.publicSite.demo}</Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}
