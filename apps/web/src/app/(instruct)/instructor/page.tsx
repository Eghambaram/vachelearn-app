import type { Metadata } from 'next';
import { WorkspacePlaceholder, workspacePlaceholderMetadata } from '@/components/shell/workspace';
import { notAvailableForRealSession } from '@/components/shell/workspace';

// Workspace home: a placeholder until its dashboard slice (D-061).
export async function generateMetadata(): Promise<Metadata> {
  return workspacePlaceholderMetadata('instructor', undefined);
}

export default async function Page() {
  // Real sessions never see the Phase 1 demo data on this screen (D-097).
  const notAvailable = await notAvailableForRealSession('/instructor');
  if (notAvailable) return notAvailable;
  return <WorkspacePlaceholder workspace="instructor" slug={undefined} />;
}
