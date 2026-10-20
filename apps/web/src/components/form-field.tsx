'use client';

import * as React from 'react';
import { CircleAlert } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { en } from '@/messages/en';

/** Props a form control needs so its label, help text and error are announced together. */
export type FieldControlProps = {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
};

type FormFieldProps = {
  label: string;
  /** Short guidance shown under the control. */
  help?: string;
  /** Validation message (usually a server `fieldErrors` entry); marks the control invalid. */
  error?: string;
  required?: boolean;
  requiredText?: string;
  className?: string;
  /** Receives the wiring props; spread them on the control: `{(field) => <Input {...field} />}`. */
  children: (field: FieldControlProps) => React.ReactNode;
};

/**
 * Visible label + help + error, linked with `htmlFor` / `aria-describedby` / `aria-invalid`.
 * Required fields say "(required)" in text, not only with a symbol.
 */
export function FormField({
  label,
  help,
  error,
  required = false,
  requiredText = en.common.required,
  className,
  children,
}: FormFieldProps) {
  const id = React.useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy =
    [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required ? (
          <>
            {' '}
            <span className="font-normal text-muted-foreground">({requiredText})</span>
          </>
        ) : null}
      </Label>
      {children({
        id,
        'aria-describedby': describedBy,
        ...(error ? { 'aria-invalid': true as const } : {}),
        ...(required ? { 'aria-required': true as const } : {}),
      })}
      {help ? (
        <p id={helpId} className="text-sm text-muted-foreground">
          {help}
        </p>
      ) : null}
      {/* Polite live region so an error that appears after submit is announced without stealing focus. */}
      <p id={errorId} aria-live="polite" className={cn('text-sm text-danger', !error && 'sr-only')}>
        {error ? (
          <span className="inline-flex items-center gap-1">
            <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
            {error}
          </span>
        ) : null}
      </p>
    </div>
  );
}
