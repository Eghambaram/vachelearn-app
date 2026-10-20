import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { MAIN_ID } from '@/components/shell/skip-link';
import { Button } from '@/components/ui/button';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/** Global 404 (UI spec #56). Same wording for "missing" and "hidden by scope", so existence never leaks. */
export default function NotFound() {
  return (
    <main
      id={MAIN_ID}
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <SearchX aria-hidden="true" className="size-8 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">{t.system.notFoundTitle}</h1>
      <p className="text-muted-foreground">{t.system.notFoundBody}</p>
      <Button asChild variant="outline">
        <Link href="/">{t.system.home}</Link>
      </Button>
    </main>
  );
}
