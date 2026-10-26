import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/**
 * The 404 body (UI spec #56). Same wording for "missing" and "hidden by scope", so existence never leaks. Rendered
 * inside the caller's landmark: the global 404 wraps it in `<main>`; layouts that already have one render it as is.
 */
export function NotFoundContent() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <SearchX aria-hidden="true" className="size-8 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">{t.system.notFoundTitle}</h1>
      <p className="text-muted-foreground">{t.system.notFoundBody}</p>
      <Button asChild variant="outline">
        <Link href="/">{t.system.home}</Link>
      </Button>
    </div>
  );
}
