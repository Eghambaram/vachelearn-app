import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { SiteChrome } from '@/features/tenant-site/site-chrome';
import { getPublicSite } from '@/lib/api/catalog';

// The demo content flag (D-110) is read at request time, so one build serves both states.
export const dynamic = 'force-dynamic';

type Props = { children: ReactNode; params: Promise<{ slug: string }> };

/** Public tenant site (D-111): seeded demo tenants only, while demo content is on; anything else is a 404. */
export default async function TenantSiteLayout({ children, params }: Props) {
  const found = getPublicSite((await params).slug);
  if (!found) notFound();
  return <SiteChrome site={found.site}>{children}</SiteChrome>;
}
