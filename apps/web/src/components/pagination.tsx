'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PAGE_LIMITS, type PageLimit } from '@/lib/table';
import { cn } from '@/lib/utils';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

type PaginationProps = {
  /** Zero-based; shown as "Page 1". Cursor lists have no total, so there is no "of N". */
  pageIndex: number;
  hasPrevious: boolean;
  /** True when the last response had `page.nextCursor`. */
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  limit?: PageLimit;
  /** Omit to hide the rows-per-page control. Changing it should reset to the first page. */
  onLimitChange?: (limit: PageLimit) => void;
  /** Disables both buttons while a page is loading. */
  disabled?: boolean;
  className?: string;
};

/** Previous/next pagination for cursor-based lists (`{ data, page: { nextCursor, limit } }`). */
export function Pagination({
  pageIndex,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  limit,
  onLimitChange,
  disabled = false,
  className,
}: PaginationProps) {
  const limitId = React.useId();
  return (
    <nav
      aria-label={t.pagination.label}
      className={cn('flex flex-wrap items-center justify-between gap-3', className)}
    >
      {onLimitChange && limit ? (
        <div className="flex items-center gap-2">
          <Label htmlFor={limitId} className="text-sm font-normal text-muted-foreground">
            {t.pagination.rowsPerPage}
          </Label>
          <Select
            value={String(limit)}
            onValueChange={(value) => onLimitChange(Number(value) as PageLimit)}
          >
            <SelectTrigger id={limitId} className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_LIMITS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        <span aria-live="polite" className="text-sm text-muted-foreground tabular-nums">
          {t.pagination.page(pageIndex + 1)}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={onPrevious}
          disabled={disabled || !hasPrevious}
        >
          <ChevronLeft aria-hidden="true" />
          {t.pagination.previous}
        </Button>
        <Button variant="outline" size="sm" onClick={onNext} disabled={disabled || !hasNext}>
          {t.pagination.next}
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
