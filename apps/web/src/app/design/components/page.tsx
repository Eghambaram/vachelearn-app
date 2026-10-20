import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDesignGalleryEnabled } from '@/lib/design-gallery';
import { ComponentGallery } from './component-gallery';

// Same runtime gate as /design: on in `next dev`, 404 in production unless ENABLE_DESIGN_GALLERY=true.
export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  if (!isDesignGalleryEnabled()) return { robots: { index: false, follow: false } };
  return {
    title: 'Components · VacheLearn (developer tool)',
    robots: { index: false, follow: false },
  };
}

export default function ComponentsPage() {
  if (!isDesignGalleryEnabled()) notFound();
  return <ComponentGallery />;
}
