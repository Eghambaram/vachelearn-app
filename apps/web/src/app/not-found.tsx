import type { Metadata } from 'next';
import { NotFoundContent } from '@/components/not-found-content';
import { MAIN_ID } from '@/components/shell/skip-link';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.system.notFoundTitle };

/** Global 404 (UI spec #56), outside any layout that provides a `<main>`. */
export default function NotFound() {
  return (
    <main id={MAIN_ID} className="flex min-h-dvh flex-col justify-center">
      <NotFoundContent />
    </main>
  );
}
