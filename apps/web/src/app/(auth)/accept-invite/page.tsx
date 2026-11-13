import type { Metadata } from 'next';
import { AcceptInvite } from '@/features/invitations/accept-invite';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.acceptInvite.title };

/** The link from an invitation email (Slice 3.1, D-116). The token stays in the URL fragment (next.config.ts: no-referrer, no-store). */
export default function AcceptInvitePage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">{t.acceptInvite.title}</h1>
      <AcceptInvite />
    </>
  );
}
