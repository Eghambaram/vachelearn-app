import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/shell/brand-logo';
import { MAIN_ID, SkipLink } from '@/components/shell/skip-link';
import { Button } from '@/components/ui/button';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/** Public website layout: marketing header and footer. Placeholder content only until approved copy exists (D-038). */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="rounded-lg">
            <BrandLogo />
            <span className="sr-only"> {t.brand.homeSuffix}</span>
          </Link>
          <nav aria-label={t.nav.label} className="flex items-center gap-2">
            <Link
              href="/help"
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {t.shell.help}
            </Link>
            <Button asChild>
              <Link href="/login">{t.publicSite.signIn}</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main id={MAIN_ID} tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <footer className="border-t bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <p>{t.publicSite.footerNote}</p>
          <p>{t.publicSite.placeholderNote}</p>
        </div>
      </footer>
    </div>
  );
}
