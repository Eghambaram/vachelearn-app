'use client';

import * as React from 'react';
import { AlertDialog } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

type ConfirmDialogProps = {
  /** The element that opens the dialog (usually a Button). Focus returns to it on close. */
  trigger: React.ReactElement;
  title: string;
  /** What will happen and to what — required, e.g. "12 learners lose access; their history is kept." */
  impact: React.ReactNode;
  /** Names the action, e.g. "Archive course" — never "OK" or "Yes". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive actions use the danger style. */
  destructive?: boolean;
  /** May be async; the dialog stays open, disables its buttons while pending, and closes only on success. */
  onConfirm: () => void | Promise<void>;
};

/**
 * Confirmation for destructive or irreversible actions (spec §16). Built on Radix AlertDialog: focus is trapped,
 * Escape and Cancel close it, clicking outside does not, and focus returns to the trigger.
 */
export function ConfirmDialog({
  trigger,
  title,
  impact,
  confirmLabel,
  cancelLabel = t.common.cancel,
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function handleConfirm(event: React.MouseEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-scrim/60" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-6 text-popover-foreground shadow-overlay">
          <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="text-sm text-muted-foreground">{impact}</div>
          </AlertDialog.Description>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={pending}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                variant={destructive ? 'destructive' : 'default'}
                disabled={pending}
                aria-busy={pending || undefined}
                onClick={handleConfirm}
              >
                {pending ? t.common.loading : confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
