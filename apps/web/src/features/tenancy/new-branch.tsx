'use client';

import { useRouter } from 'next/navigation';
import { BranchForm } from './branch-form';

/** The "Add a branch" page body: on success the form opens the new branch; Cancel goes back to the list. */
export function NewBranch({ defaultTimezone }: { defaultTimezone?: string }) {
  const router = useRouter();
  return (
    <BranchForm defaultTimezone={defaultTimezone} onCancel={() => router.push('/admin/branches')} />
  );
}
