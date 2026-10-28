import type { Metadata } from 'next';
import { SetPasswordForm } from '@/features/auth/set-password-form';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.auth.resetTitle };

/** New password from a reset email (D-087). The token stays in the URL fragment (next.config.ts: no-referrer, no-store). */
export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">{t.auth.resetTitle}</h1>
      <SetPasswordForm purpose="reset" />
    </>
  );
}
