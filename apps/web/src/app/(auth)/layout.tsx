import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/shell/brand-logo';
import { MAIN_ID, SkipLink } from '@/components/shell/skip-link';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/** Auth layout: sign-in, workspace picker and system states, centred on the app background. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10 sm:py-16">
      <SkipLink />
      <header className="mb-8">
        <Link href="/" className="inline-flex rounded-lg">
          <BrandLogo size="lg" />
          <span className="sr-only"> {t.brand.homeSuffix}</span>
        </Link>
      </header>
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className="flex w-full max-w-md flex-col gap-6 rounded-xl border bg-card p-6 shadow-card outline-none sm:p-8"
      >
        {children}
      </main>
    </div>
  );
}
