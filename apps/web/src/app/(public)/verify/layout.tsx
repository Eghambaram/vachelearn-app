import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { isDemoVerificationEnabled } from '@/lib/dev-tools';

// Rendered per request: the flag is read at runtime, never baked into a static page at build time.
export const dynamic = 'force-dynamic';

/**
 * Gate for every /verify page (D-074). Thrown from the layout, `notFound()` renders the site's generic 404, so a build
 * without demo verification does not even show verification-specific wording.
 */
export default function VerifyLayout({ children }: { children: ReactNode }) {
  if (!isDemoVerificationEnabled()) notFound();
  return children;
}
