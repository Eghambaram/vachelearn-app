import Link from 'next/link';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/** Same wording for a malformed, unknown or never-issued id, so the page never says whether an id existed. */
export default function VerificationNotFound() {
  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold">{t.verify.notFoundTitle}</h1>
      <p className="text-muted-foreground">{t.verify.notFoundBody}</p>
      <Link
        href="/verify"
        className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {t.verify.checkAnother}
      </Link>
    </section>
  );
}
