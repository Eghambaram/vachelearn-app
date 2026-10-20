import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { contrastRatio } from '@/lib/contrast';
import { isDesignGalleryEnabled } from '@/lib/design-gallery';
import { CONTRAST_PAIRS, readColorTokens, type ContrastPair } from '@/styles/tokens';

// Evaluated per request so ENABLE_DESIGN_GALLERY is read at runtime, not baked in at build time.
export const dynamic = 'force-dynamic';

// Metadata is computed per request too, so a disabled gallery's 404 does not reveal the page title.
export function generateMetadata(): Metadata {
  if (!isDesignGalleryEnabled()) return { robots: { index: false, follow: false } };
  return {
    title: 'Design tokens · VacheLearn (developer tool)',
    robots: { index: false, follow: false },
  };
}

const TYPE_SCALE = [
  { className: 'text-xs', px: 12 },
  { className: 'text-sm', px: 14 },
  { className: 'text-base', px: 16 },
  { className: 'text-lg', px: 18 },
  { className: 'text-xl', px: 20 },
  { className: 'text-2xl', px: 24 },
  { className: 'text-3xl', px: 30 },
  { className: 'text-4xl', px: 36 },
] as const;

const SPACING = [1, 2, 3, 4, 6, 8, 12, 16] as const;

const BUTTON_VARIANTS = [
  'default',
  'outline',
  'secondary',
  'ghost',
  'destructive',
  'link',
] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border bg-card p-4 shadow-card sm:p-6">
      <h2 id={id} className="mb-4 text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ScrollTable({ label, children }: { label: string; children: ReactNode }) {
  return (
    // Focusable so keyboard users can scroll it at 360 px (axe: scrollable-region-focusable).
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

/**
 * Shows each pair the way it may actually be used: 4.5:1 pairs as body text; 3:1 pairs only as large text (brand)
 * or as a non-text boundary/focus sample — rendering them as small text would itself be an accessibility failure.
 */
function PairSample({ foreground, background, minimum }: Omit<ContrastPair, 'use'>) {
  const bg = `var(--vl-color-${background})`;
  const fg = `var(--vl-color-${foreground})`;
  if (minimum === 4.5) {
    return (
      <span
        className="inline-flex h-8 items-center rounded-md px-2 font-medium"
        style={{ color: fg, backgroundColor: bg }}
      >
        Aa
      </span>
    );
  }
  if (foreground === 'brand') {
    return (
      <span
        className="inline-flex h-10 items-center rounded-md px-2 text-2xl font-semibold"
        style={{ color: fg, backgroundColor: bg }}
      >
        Aa
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-8 items-center rounded-md px-2"
      style={{ backgroundColor: bg }}
    >
      <span className="block size-5 rounded-sm border-2" style={{ borderColor: fg }} />
    </span>
  );
}

export default function DesignTokensPage() {
  if (!isDesignGalleryEnabled()) notFound();

  const tokens = readColorTokens();
  const pairs = CONTRAST_PAIRS.map((pair) => {
    const ratio = contrastRatio(tokens[pair.foreground] ?? '', tokens[pair.background] ?? '');
    return { ...pair, ratio, passes: ratio >= pair.minimum };
  });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          Developer tool · not shown in production
        </p>
        <h1 className="text-3xl font-semibold">Design tokens</h1>
        <p className="max-w-3xl text-muted-foreground">
          Generated from <code>src/styles/tokens.css</code>. Contrast ratios are computed live; the
          same checks run as unit tests. Components arrive in Slice 1.3.
        </p>
      </header>

      <Section id="colours" title="Colours">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(tokens).map(([name, value]) => (
            <li key={name} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="size-10 shrink-0 rounded-lg border border-input"
                style={{ backgroundColor: `var(--vl-color-${name})` }}
              />
              <span className="flex flex-col">
                <code className="text-sm">--vl-color-{name}</code>
                <span className="text-xs text-muted-foreground tabular-nums">{value}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="contrast" title="Contrast pairs (WCAG 2.2)">
        <ScrollTable label="Contrast pairs">
          <thead>
            <tr className="border-b">
              <th scope="col" className="py-2 pr-3 font-medium">
                Sample
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Foreground / background
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Use
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Ratio
              </th>
              <th scope="col" className="py-2 font-medium">
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => (
              <tr
                key={`${p.foreground}-${p.background}-${p.use}`}
                className="border-b last:border-0"
              >
                <td className="py-2 pr-3">
                  <PairSample
                    foreground={p.foreground}
                    background={p.background}
                    minimum={p.minimum}
                  />
                </td>
                <td className="py-2 pr-3">
                  <code>{p.foreground}</code> on <code>{p.background}</code>
                </td>
                <td className="py-2 pr-3 text-muted-foreground">{p.use}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {p.ratio.toFixed(2)}:1{' '}
                  <span className="text-muted-foreground">(≥ {p.minimum})</span>
                </td>
                <td className="py-2">
                  {p.passes ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-success-subtle px-2 py-0.5 text-success">
                      <Check aria-hidden="true" className="size-4" /> Pass
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-danger-subtle px-2 py-0.5 text-danger">
                      <X aria-hidden="true" className="size-4" /> Fail
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
      </Section>

      <Section id="typography" title="Typography">
        <p className="mb-4 text-sm text-muted-foreground">
          Inter Variable, self-hosted (D-059). Tabular numerals for tables and KPIs:{' '}
          <span className="tabular-nums">₹1,25,000.00 · 09:30 IST · 98.5%</span>
        </p>
        <ul className="flex flex-col gap-2">
          {TYPE_SCALE.map(({ className, px }) => (
            <li key={className} className="flex flex-wrap items-baseline gap-x-4">
              <span className="w-28 shrink-0 text-xs text-muted-foreground tabular-nums">
                {className} · {px}px
              </span>
              <span className={className}>Learn, practise, prove, certify</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="spacing" title="Spacing (4 px grid), radius and shadow">
        <ul className="mb-6 flex flex-col gap-2">
          {SPACING.map((step) => (
            <li key={step} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">
                {step} · {step * 4}px
              </span>
              <span
                aria-hidden="true"
                className="h-3 rounded-sm bg-brand"
                style={{ width: `${step * 4}px` }}
              />
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-4">
          <div className="rounded-lg border bg-card p-4 text-sm">Control radius 8px</div>
          <div className="rounded-xl border bg-card p-4 text-sm shadow-card">
            Card radius 12px + card shadow
          </div>
          <div className="rounded-xl bg-card p-4 text-sm shadow-overlay">Overlay shadow</div>
        </div>
      </Section>

      <Section id="buttons" title="Buttons (shadcn/ui, restyled)">
        <div className="flex flex-wrap items-center gap-3">
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant === 'default' ? 'Primary' : variant[0]!.toUpperCase() + variant.slice(1)}
            </Button>
          ))}
          <Button disabled>Disabled</Button>
        </div>
        <div className="surface-dark mt-6 flex flex-wrap items-center gap-3 rounded-xl bg-sidebar p-4">
          <span className="text-sm text-sidebar-foreground">Sidebar surface</span>
          <a
            href="#buttons"
            className="rounded-md px-2 py-1 text-sm text-sidebar-muted hover:text-sidebar-foreground"
          >
            Focusable link (inverse focus ring)
          </a>
          <span className="rounded-md bg-sidebar-active px-2 py-1 text-sm text-sidebar-foreground">
            Active item
          </span>
        </div>
      </Section>
    </main>
  );
}
