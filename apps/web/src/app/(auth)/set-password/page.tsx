import type { Metadata } from 'next';
import { SetPasswordForm } from '@/features/auth/set-password-form';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.auth.setTitle };

/** First password for a new account (D-083): the link from the set-password email. The token stays in the URL fragment (next.config.ts: no-referrer, no-store). */
export default function SetPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">{t.auth.setTitle}</h1>
      <SetPasswordForm purpose="set" />
    </>
  );
}
