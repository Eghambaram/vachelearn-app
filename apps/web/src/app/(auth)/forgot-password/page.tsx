import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/features/auth/forgot-password-form';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.auth.forgotTitle };

/** "Forgot password" (D-087). */
export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">{t.auth.forgotTitle}</h1>
      <p className="text-muted-foreground">{t.auth.forgotBody}</p>
      <ForgotPasswordForm />
    </>
  );
}
