import type { Metadata } from 'next';
import { WorkspacePlaceholder, workspacePlaceholderMetadata } from '@/components/shell/workspace';

// Workspace home: a placeholder until its dashboard slice (D-061).
export async function generateMetadata(): Promise<Metadata> {
  return workspacePlaceholderMetadata('instructor', undefined);
}

export default function Page() {
  return <WorkspacePlaceholder workspace="instructor" slug={undefined} />;
}
