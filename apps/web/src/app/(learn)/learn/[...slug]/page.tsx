import type { Metadata } from 'next';
import { WorkspacePlaceholder, workspacePlaceholderMetadata } from '@/components/shell/workspace';

// Placeholder pages for nav items whose screens are not built yet (D-061). Real screens get their own routes, which
// take precedence over this catch-all.
type Props = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return workspacePlaceholderMetadata('learn', (await params).slug);
}

export default async function Page({ params }: Props) {
  return <WorkspacePlaceholder workspace="learn" slug={(await params).slug} />;
}
