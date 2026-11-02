'use client';

import * as React from 'react';
import { AlertDialog } from 'radix-ui';
import { FormField } from '@/components/form-field';
import { InlineAlert, useFocusOnChange } from '@/components/inline-alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

type ReasonDialogProps = {
  /** The element that opens the dialog (usually a Button). Focus returns to it on close. */
  trigger: React.ReactElement;
  title: string;
  /** What will happen and to whom (spec §16). */
  impact: React.ReactNode;
  confirmLabel: string;
  reasonLabel: string;
  reasonHelp?: string;
  /** Shown when the reason is shorter than 3 characters (the API's minimum). */
  reasonError: string;
  destructive?: boolean;
  /**
   * Where focus goes when the dialog closes; default: back to the trigger. Call `event.preventDefault()` to send it
   * elsewhere, e.g. to the result message when the action removed the trigger (WCAG 2.4.3).
   */
  onCloseAutoFocus?: (event: Event) => void;
  /** Resolves to an error message to show (the dialog stays open), or null on success (it closes). */
  onConfirm: (reason: string) => Promise<string | null>;
};

/**
 * Confirmation that records a reason (deactivate, revoke…): like ConfirmDialog — focus trapped, Escape and Cancel
 * close it, clicking outside does not, focus returns to the trigger — plus a required reason field. A refusal from the
 * API keeps the dialog open with the error shown and focused, so nothing is silently lost.
 */
export function ReasonDialog({
  trigger,
  title,
  impact,
  confirmLabel,
  reasonLabel,
  reasonHelp,
  reasonError,
  destructive = false,
  onCloseAutoFocus,
  onConfirm,
}: ReasonDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [fieldError, setFieldError] = React.useState<string | undefined>();
  const [error, setError] = React.useState<string | null>(null);
  const errorRef = useFocusOnChange<HTMLDivElement>(error);
  const reasonRef = React.useRef<HTMLTextAreaElement>(null);

  function changeOpen(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) {
      setError(null);
      setFieldError(undefined);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
    setError(null);
    if (reason.length < 3) {
      setFieldError(reasonError);
      reasonRef.current?.focus();
      return;
    }
    setFieldError(undefined);
    setPending(true);
    const failure = await onConfirm(reason);
    setPending(false);
    if (failure) setError(failure);
    else setOpen(false);
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={changeOpen}>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-scrim/60" />
        <AlertDialog.Content
          onCloseAutoFocus={onCloseAutoFocus}
          className="fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl bg-popover p-6 text-popover-foreground shadow-overlay"
        >
          <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="text-sm text-muted-foreground">{impact}</div>
          </AlertDialog.Description>
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {error ? (
              <InlineAlert ref={errorRef} tone="danger">
                {error}
              </InlineAlert>
            ) : null}
            <FormField label={reasonLabel} help={reasonHelp} error={fieldError} required>
              {(field) => (
                <Textarea {...field} ref={reasonRef} name="reason" rows={3} maxLength={500} />
              )}
            </FormField>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AlertDialog.Cancel asChild>
                <Button type="button" variant="outline" disabled={pending}>
                  {t.common.cancel}
                </Button>
              </AlertDialog.Cancel>
              <Button
                type="submit"
                variant={destructive ? 'destructive' : 'default'}
                aria-disabled={pending || undefined}
              >
                {pending ? t.common.loading : confirmLabel}
              </Button>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
