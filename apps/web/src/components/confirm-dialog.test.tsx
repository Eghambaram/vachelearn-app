import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from './confirm-dialog';

function setup(onConfirm = vi.fn()) {
  render(
    <ConfirmDialog
      trigger={<Button>Archive course</Button>}
      title="Archive “Forklift Safety”?"
      impact="New enrollments stop. 12 learners keep their progress and certificates."
      confirmLabel="Archive course"
      destructive
      onConfirm={onConfirm}
    />,
  );
  return {
    user: userEvent.setup({ delay: null }),
    onConfirm,
    trigger: screen.getByRole('button', { name: 'Archive course' }),
  };
}

describe('ConfirmDialog', () => {
  it('opens as an alertdialog that names the action and states its impact', async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    const dialog = await screen.findByRole('alertdialog', { name: 'Archive “Forklift Safety”?' });
    expect(dialog).toHaveAccessibleDescription(/12 learners keep their progress/);
    // The confirm button repeats the action name; nothing says "OK" or "Yes".
    expect(within(dialog).getByRole('button', { name: 'Archive course' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^(ok|yes)$/i })).toBeNull();
    // Modal: everything behind it, including the trigger, is hidden from assistive technology.
    expect(trigger.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('closes on Escape without confirming and returns focus to the trigger', async () => {
    const { user, trigger, onConfirm } = setup();
    await user.click(trigger);
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it('calls onConfirm once, then closes and returns focus to the trigger', async () => {
    const { user, trigger, onConfirm } = setup();
    await user.click(trigger);
    const dialog = await screen.findByRole('alertdialog');
    await user.click(
      [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Archive course')!,
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });

  it('stays open and disables its buttons while an async confirm is pending', async () => {
    let finish!: () => void;
    const { user, trigger } = setup(
      vi.fn(() => new Promise<void>((resolve) => (finish = resolve))),
    );
    await user.click(trigger);
    const dialog = await screen.findByRole('alertdialog');
    await user.click(
      [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Archive course')!,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    finish();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
