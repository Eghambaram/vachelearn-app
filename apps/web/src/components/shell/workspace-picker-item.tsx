'use client';

import * as React from 'react';
import { Building2, Check } from 'lucide-react';
import { switchDemoTenant } from '@/app/demo-actions';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export function WorkspacePickerItem({
  tenantId,
  name,
  current,
}: {
  tenantId: string;
  name: string;
  current: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={() => startTransition(() => switchDemoTenant(tenantId))}
      className="flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left hover:bg-muted disabled:opacity-60"
    >
      <Building2 aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      <span className="flex-1 font-medium">{name}</span>
      {current ? (
        <span className="flex items-center gap-1 text-xs font-medium text-primary">
          <Check aria-hidden="true" className="size-4" />
          {t.auth.currentWorkspace}
        </span>
      ) : null}
    </button>
  );
}
