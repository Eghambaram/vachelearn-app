'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DashboardPeriod } from '@vachelearn/contracts';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/** Period lives in the URL (shareable, back-button friendly); the server recomputes the dashboard for it. */
export function PeriodFilter({ value }: { value: DashboardPeriod }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const id = React.useId();

  function change(next: string) {
    const params = new URLSearchParams(searchParams);
    params.set('period', next);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex items-center gap-2" aria-busy={pending || undefined}>
      <Label htmlFor={id}>{t.period.label}</Label>
      <Select value={value} onValueChange={change}>
        <SelectTrigger id={id} className="h-9 w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DashboardPeriod.options.map((period) => (
            <SelectItem key={period} value={period}>
              {t.period.options[period]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
