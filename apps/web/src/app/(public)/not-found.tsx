import type { Metadata } from 'next';
import { NotFoundContent } from '@/components/not-found-content';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.system.notFoundTitle };

/**
 * 404 inside the public layout, which already renders `<main>` (no nested or duplicate main landmark). Also what a
 * disabled `/verify` shows: the generic wording, nothing verification-specific (D-074).
 */
export default function PublicNotFound() {
  return <NotFoundContent />;
}
