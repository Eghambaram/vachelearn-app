import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { normalizeVerificationId } from '@vachelearn/contracts';
import { DemoBadge } from '@/components/demo-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { verificationPath } from '@/features/learn/certificates/paths';
import { isDemoVerificationEnabled } from '@/lib/dev-tools';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const v = t.verify;

// Rendered per request so the runtime flag and the query decide (exit-gate review).
export const dynamic = 'force-dynamic';

// Decided per request like the page: a disabled build shows the generic 404 title, nothing verification-specific.
export async function generateMetadata(): Promise<Metadata> {
  return isDemoVerificationEnabled()
    ? { title: v.title, robots: { index: false, follow: false } }
    : { title: t.system.notFoundTitle };
}

// A repeated parameter (`?id=a&id=b`) arrives as an array: treated as an invalid id, never a 500.
type Props = { searchParams: Promise<{ id?: string | string[] }> };

/**
 * Public certificate lookup (UI spec #43). A plain GET form, so it works without JavaScript; a well-formed id goes
 * to its result page, anything else is explained here. Demo surface until Phase 4: off in production builds (D-074).
 */
export default async function VerifyLookupPage({ searchParams }: Props) {
  if (!isDemoVerificationEnabled()) notFound();
  const raw = (await searchParams).id;
  const id = raw === undefined ? undefined : typeof raw === 'string' ? raw : '';
  const normalized = id === undefined ? null : normalizeVerificationId(id);
  if (normalized) redirect(verificationPath(normalized));
  const invalid = id !== undefined;
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">{v.title}</h1>
          <DemoBadge />
        </div>
        <p className="text-muted-foreground">{v.description}</p>
      </div>
      <form method="get" action="/verify" className="flex flex-col gap-2" noValidate>
        <label htmlFor="verification-id" className="text-sm font-medium">
          {v.idLabel}
        </label>
        <Input
          id="verification-id"
          name="id"
          defaultValue={id ?? ''}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid || undefined}
          aria-describedby={
            invalid ? 'verification-id-help verification-id-error' : 'verification-id-help'
          }
        />
        <p id="verification-id-help" className="text-sm text-muted-foreground">
          {v.idHelp}
        </p>
        {invalid ? (
          <p id="verification-id-error" role="alert" className="text-sm font-medium text-danger">
            {v.idInvalid}
          </p>
        ) : null}
        <Button type="submit" className="mt-2 self-start">
          {v.submit}
        </Button>
      </form>
    </section>
  );
}
