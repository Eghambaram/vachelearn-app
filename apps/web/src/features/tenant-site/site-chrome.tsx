import * as React from 'react';
import Link from 'next/link';
import { DemoBadge } from '@/components/demo-badge';
import { MAIN_ID, SkipLink } from '@/components/shell/skip-link';
import { Button } from '@/components/ui/button';
import { getMessages } from '@/lib/i18n';
import type { DemoSite } from '@/features/catalog/types';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const s = t.tenantSite;

function initials(name: string) {
  return name
    .replace(/^Demo /, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('');
}

/** The tenant's mark: initials on its accent colour (until tenant logos exist, Phase 6). */
export function SiteMark({ site }: { site: DemoSite }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-9 items-center justify-center rounded-xl bg-[var(--site-accent)] text-sm font-bold tracking-tight text-primary-foreground shadow-sm"
    >
      {initials(site.name)}
    </span>
  );
}

/**
 * Public tenant site frame (D-111): tenant header with sign-in, the page, and a footer that says it is a demo
 * organisation. Sets the tenant accent (a design token) for everything inside.
 */
export function SiteChrome({ site, children }: { site: DemoSite; children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-dvh flex-col bg-background"
      style={
        {
          '--site-accent': site.accent,
          '--site-accent-hover': site.accentHover,
        } as React.CSSProperties
      }
    >
      <SkipLink />
      <header className="sticky top-0 z-20 border-b bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/75">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href={`/t/${site.slug}`} className="flex min-w-0 items-center gap-3 rounded-lg">
            <SiteMark site={site} />
            <span className="truncate font-semibold tracking-tight">{site.name}</span>
            <span className="sr-only"> {s.homeSuffix}</span>
          </Link>
          <nav aria-label={t.nav.label} className="flex items-center gap-1 sm:gap-2">
            <DemoBadge className="hidden sm:inline-flex" />
            <Link
              href={`/t/${site.slug}#catalog`}
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground sm:block"
            >
              {s.browse}
            </Link>
            <Button
              asChild
              className="bg-[var(--site-accent)] text-primary-foreground hover:bg-[var(--site-accent-hover)]"
            >
              <Link href="/login">
                {s.signIn}
                <span className="sr-only">{s.signInSuffix(site.name)}</span>
              </Link>
            </Button>
          </nav>
        </div>
      </header>
      <main id={MAIN_ID} tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <footer className="surface-dark bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <SiteMark site={site} />
            <div>
              <p className="font-semibold">{site.name}</p>
              <p className="text-sm text-sidebar-muted">{s.poweredBy}</p>
            </div>
          </div>
          <p className="max-w-md text-sm text-sidebar-muted">{s.demoNote}</p>
        </div>
      </footer>
    </div>
  );
}
