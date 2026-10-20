import Image from 'next/image';
import { cn } from '@/lib/utils';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/**
 * Horizontal lockup of the owner-supplied logo (assets/brand/vache-logo.svg): the mark, derived unchanged into
 * public/brand/vache-mark.svg, beside the wordmark set as live text in the logo's own type (Inter 500, tracked).
 * The logo's green reads on light surfaces and on the sidebar, so one version serves both. Decorative inside a
 * labelled link; pass `label` when it stands alone.
 */
export function BrandLogo({
  size = 'md',
  label,
  className,
}: {
  size?: 'md' | 'lg';
  label?: string;
  className?: string;
}) {
  // The mark's dashed outer ring takes much of its box, so it renders larger than the wordmark's cap height.
  const mark = size === 'lg' ? 64 : 44;
  return (
    <span
      className={cn('inline-flex items-center gap-2', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <Image src="/brand/vache-mark.svg" alt="" width={mark} height={mark} unoptimized priority />
      <span
        aria-hidden={label ? true : undefined}
        className={cn(
          'font-medium tracking-[0.1em] text-brand',
          size === 'lg' ? 'text-3xl' : 'text-2xl',
        )}
      >
        {t.brand.wordmark}
      </span>
    </span>
  );
}
