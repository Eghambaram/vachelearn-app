import type { Metadata } from 'next';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.help.title };

/** Target of every "Help" link. An honest stub until the help centre (Phase 7). */
export default function HelpPage() {
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold">{t.help.title}</h1>
      <p className="text-muted-foreground">{t.help.body}</p>
    </section>
  );
}
