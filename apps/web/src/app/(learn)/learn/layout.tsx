import type { ReactNode } from 'react';
import { WorkspaceLayout } from '@/components/shell/workspace';

export default function Layout({ children }: { children: ReactNode }) {
  return <WorkspaceLayout workspace="learn">{children}</WorkspaceLayout>;
}
