import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const MAIN_ID = 'main';

/** First focusable element on every page (WCAG 2.4.1). Hidden until focused. */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_ID}`}
      className="fixed top-2 left-2 z-[60] -translate-y-20 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-overlay focus-visible:translate-y-0"
    >
      {t.shell.skipToContent}
    </a>
  );
}
