import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Award, BookOpenCheck, ClipboardCheck, RefreshCcw, Target } from 'lucide-react';
import { DemoBadge } from '@/components/demo-badge';
import { Button } from '@/components/ui/button';
import { CatalogBrowser } from '@/features/catalog/catalog-browser';
import { CourseMeta, CourseVisual } from '@/features/catalog/course-card';
import { getPublicSite } from '@/lib/api/catalog';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const s = t.tenantSite;

const JOURNEY_ICONS = [BookOpenCheck, Target, ClipboardCheck, Award, RefreshCcw];

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = getPublicSite((await params).slug);
  return found
    ? { title: found.site.name, description: found.site.intro, robots: { index: false } }
    : {};
}

/** Public tenant home (D-111): hero, how learning works, and the public course catalog (sample data, Demo). */
export default async function TenantSitePage({ params }: Props) {
  const { slug } = await params;
  const found = getPublicSite(slug);
  if (!found) notFound();
  const { site, courses } = found;
  const featured = courses[0];

  return (
    <>
      <section className="relative overflow-hidden border-b bg-card">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(60rem_30rem_at_85%_-10%,color-mix(in_srgb,var(--site-accent)_16%,transparent),transparent),radial-gradient(40rem_24rem_at_-10%_110%,color-mix(in_srgb,var(--site-accent)_10%,transparent),transparent)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent)] bg-[linear-gradient(to_right,color-mix(in_srgb,var(--vl-color-border)_45%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_srgb,var(--vl-color-border)_45%,transparent)_1px,transparent_1px)] bg-[size:48px_48px] opacity-60"
        />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:px-8 lg:py-28">
          <div className="flex flex-col items-start gap-6">
            <p className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-sm font-medium shadow-sm">
              <span aria-hidden="true" className="size-2 rounded-full bg-[var(--site-accent)]" />
              {s.sectorDemo(site.sector)}
            </p>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              {site.headline}
            </h1>
            <p className="max-w-xl text-lg text-pretty text-muted-foreground">{site.intro}</p>
            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="bg-[var(--site-accent)] text-primary-foreground hover:bg-[var(--site-accent-hover)]"
              >
                <Link href="#catalog">
                  {s.browse}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="bg-card">
                <Link href="/login">
                  {s.signIn}
                  <span className="sr-only">{s.signInSuffix(site.name)}</span>
                </Link>
              </Button>
            </div>
          </div>

          {featured ? (
            <div className="relative mx-auto w-full max-w-md lg:mx-0 lg:justify-self-end">
              <div
                aria-hidden="true"
                className="absolute -inset-4 rotate-3 rounded-3xl bg-[color-mix(in_srgb,var(--site-accent)_12%,transparent)]"
              />
              <article className="relative flex flex-col overflow-hidden rounded-3xl border bg-card shadow-xl">
                <CourseVisual category={featured.category?.name ?? null} />
                <div className="flex flex-col gap-3 p-6">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold tracking-wide text-[var(--site-accent)] uppercase">
                      {featured.category?.name}
                    </p>
                    <DemoBadge />
                  </div>
                  <h2 className="text-xl font-semibold">
                    <Link
                      href={`/t/${site.slug}/courses/${featured.id}`}
                      className="rounded hover:underline"
                    >
                      {featured.title}
                    </Link>
                  </h2>
                  <p className="text-sm text-muted-foreground">{featured.summary}</p>
                  <CourseMeta course={featured} />
                  <ol className="mt-2 flex flex-col gap-2 border-t pt-4">
                    {featured.modules.slice(0, 3).map((module, m) => (
                      <li key={module.id} className="flex items-center gap-3 text-sm">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                          {m + 1}
                        </span>
                        <span className="flex-1">{module.title}</span>
                        <span className="text-muted-foreground">
                          {t.catalog.lessons(module.lessons.length)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </article>
            </div>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="journey" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 id="journey" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {s.journeyTitle}
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {s.journey.map((step, i) => {
            const Icon = JOURNEY_ICONS[i]!;
            return (
              <li
                key={step.title}
                className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--site-accent)_12%,var(--vl-color-surface))] text-[var(--site-accent)]">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <p className="font-semibold">
                  <span className="sr-only">{i + 1}. </span>
                  {step.title}
                </p>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <section
        id="catalog"
        aria-labelledby="catalog-title"
        className="scroll-mt-20 border-t bg-card/50"
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="catalog-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {s.catalogTitle}
              </h2>
              <DemoBadge />
            </div>
            <p className="max-w-2xl text-muted-foreground">{s.catalogBody}</p>
          </div>
          <CatalogBrowser
            courses={courses.map(({ modules: _modules, ...course }) => ({
              ...course,
              href: `/t/${site.slug}/courses/${course.id}`,
            }))}
          />
        </div>
      </section>
    </>
  );
}
