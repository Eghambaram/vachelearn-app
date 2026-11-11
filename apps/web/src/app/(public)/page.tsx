import * as React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { DemoBadge } from '@/components/demo-badge';
import { Button } from '@/components/ui/button';
import { SiteMark } from '@/features/tenant-site/site-chrome';
import { isDemoContentEnabled, isDemoWorkspacesEnabled } from '@/lib/dev-tools';
import { getMessages } from '@/lib/i18n';
import { DEMO_SITES } from '@/mocks/catalog';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const s = t.tenantSite;

// The demo gates (D-063, D-110) are read at request time, like /design, so one build serves both states.
export const dynamic = 'force-dynamic';

/**
 * Marketing landing (UI spec #1): placeholder copy until approved content exists (D-038). While demo content is on
 * (D-110, D-111), it also links to the demo organisations' public pages.
 */
export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden border-b bg-card">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(60rem_30rem_at_80%_-20%,color-mix(in_srgb,var(--vl-color-brand)_14%,transparent),transparent)]"
        />
        <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 sm:py-24">
          <p className="rounded-md bg-warning-subtle px-2 py-1 text-xs font-medium text-warning">
            {t.publicSite.placeholderNote}
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            {t.publicSite.heroTitle}
          </h1>
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
        </div>
      </section>

      {isDemoContentEnabled() ? (
        <section
          aria-labelledby="demo-orgs"
          className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-16 sm:px-6"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="demo-orgs" className="text-2xl font-semibold tracking-tight">
                {s.exploreTitle}
              </h2>
              <DemoBadge />
            </div>
            <p className="text-muted-foreground">{s.exploreBody}</p>
          </div>
          <ul className="grid gap-5 md:grid-cols-2">
            {DEMO_SITES.map((site) => (
              <li
                key={site.slug}
                style={{ '--site-accent': site.accent } as React.CSSProperties}
                className="group relative flex flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <SiteMark site={site} />
                  <div>
                    <h3 className="font-semibold">
                      <Link
                        href={`/t/${site.slug}`}
                        className="outline-none after:absolute after:inset-0"
                      >
                        {site.name}
                      </Link>
                    </h3>
                    <p className="text-sm text-muted-foreground">{site.sector}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{site.intro}</p>
                <p className="mt-auto flex items-center gap-1.5 text-sm font-medium text-[var(--site-accent)]">
                  {s.exploreCta(site.name)}
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                  />
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
