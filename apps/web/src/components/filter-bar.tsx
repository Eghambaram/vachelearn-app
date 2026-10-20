'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { en } from '@/messages/en';

type FilterBarProps = {
  /** Controlled search text. Debounce before requesting (see `useDebouncedValue`); the server does the search. */
  search?: {
    value: string;
    onChange: (value: string) => void;
    label?: string;
    placeholder?: string;
  };
  /** Filter controls, each with its own visible label (FormField + Select/Combobox/DatePicker). */
  children?: React.ReactNode;
  /** Number of filters that differ from their defaults (search excluded). */
  activeCount?: number;
  /** Resets search and filters to their defaults. Shown only when something is applied. */
  onClear?: () => void;
  className?: string;
};

/**
 * Search + filters above a list. Filter values are only hints to the API: it validates them and applies tenant and
 * branch scope itself, so changing a filter can never widen what the viewer sees.
 */
export function FilterBar({
  search,
  children,
  activeCount = 0,
  onClear,
  className,
}: FilterBarProps) {
  const searchId = React.useId();
  const applied = activeCount > 0 || Boolean(search?.value);
  return (
    <div
      role="search"
      aria-label={en.filterBar.label}
      className={cn('flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end', className)}
    >
      {search ? (
        <div className="flex min-w-0 flex-col gap-1.5 md:w-72">
          <Label htmlFor={searchId}>{search.label ?? en.filterBar.search}</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={searchId}
              type="search"
              value={search.value}
              placeholder={search.placeholder}
              onChange={(event) => search.onChange(event.target.value)}
              className="h-9 pl-8"
            />
          </div>
        </div>
      ) : null}
      {children}
      {onClear && applied ? (
        <div className="flex items-center gap-3 md:ml-auto">
          {activeCount > 0 ? (
            <span className="text-sm text-muted-foreground">
              {en.filterBar.active(activeCount)}
            </span>
          ) : null}
          <Button variant="ghost" onClick={onClear}>
            <X aria-hidden="true" />
            {en.filterBar.clear}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
