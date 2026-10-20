'use client';

import * as React from 'react';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { FieldControlProps } from '@/components/form-field';
import { DEFAULT_LOCALE, formatDateOnly } from '@/lib/format';
import { cn } from '@/lib/utils';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/** `YYYY-MM-DD` — a calendar date with no time or timezone (e.g. a due date). */
export type IsoDate = string;

function toIsoDate(date: Date): IsoDate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromIsoDate(value: IsoDate): Date {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

type DatePickerProps = Partial<FieldControlProps> & {
  value: IsoDate | null;
  onValueChange: (value: IsoDate | null) => void;
  placeholder?: string;
  locale?: string;
  className?: string;
};

/**
 * Date-only picker. The trigger shows the date in words; the calendar grid is fully keyboard operable
 * (arrows, Page Up/Down, Home/End, Enter). Selecting closes the popover and returns focus to the trigger.
 */
export function DatePicker({
  value,
  onValueChange,
  placeholder = t.datePicker.placeholder,
  locale = DEFAULT_LOCALE,
  className,
  ...field
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? fromIsoDate(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-start gap-2 font-normal',
            !value && 'text-muted-foreground',
            className,
          )}
          {...field}
        >
          <CalendarIcon aria-hidden="true" className="text-muted-foreground" />
          {value ? formatDateOnly(value, { locale }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onValueChange(date ? toIsoDate(date) : null);
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
