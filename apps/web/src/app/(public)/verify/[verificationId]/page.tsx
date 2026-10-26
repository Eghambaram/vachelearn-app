import { ReloadButton } from '@/components/reload-button';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { normalizeVerificationId } from '@vachelearn/contracts';
import { DemoBadge } from '@/components/demo-badge';
import { ErrorState } from '@/components/error-state';
import { verificationPath } from '@/features/learn/certificates/paths';
import { VerificationResult } from '@/features/verify/verification-result';
import { verifyCertificate } from '@/lib/api/verification';
import { isDemoVerificationEnabled } from '@/lib/dev-tools';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const v = t.verify;

type Props = { params: Promise<{ verificationId: string }> };

// Verification results are never indexed: an id is shared on purpose, not published. The title follows the outcome:
// the generic 404 title when disabled, "No certificate matches" for an id that matches nothing (exit-gate review).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isDemoVerificationEnabled()) return { title: t.system.notFoundTitle };
  const canonical = normalizeVerificationId((await params).verificationId);
  const found = canonical ? (await verifyCertificate(canonical)).ok : false;
  return {
    title: found ? v.resultTitle : v.notFoundTitle,
    robots: { index: false, follow: false },
  };
}

/**
 * Public certificate verification (UI spec #43, D-017): anyone with the id sees the status and the minimal D-017
 * fields. One URL per certificate: a typed variant (case, spaces, no dashes) redirects to the canonical id; anything
 * that cannot be an id, and any unknown id, gets the same 404. No demo states here — a public result must never be
 * made to look broken by a link (security review, 1.5.7). Demo surface until Phase 4 (D-074).
 */
export default async function VerifyResultPage({ params }: Props) {
  if (!isDemoVerificationEnabled()) notFound();
  // Next has already decoded the segment once; it is not decoded again.
  const segment = (await params).verificationId;
  const canonical = normalizeVerificationId(segment);
  if (!canonical) notFound();
  if (canonical !== segment) redirect(verificationPath(canonical));
  const result = await verifyCertificate(canonical);
  if (!result.ok && result.status === 404) notFound();
  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold">{v.resultTitle}</h1>
        <DemoBadge />
      </div>
      <p className="text-sm text-muted-foreground">{v.demoNote}</p>
      {result.ok ? (
        <VerificationResult data={result.data} />
      ) : (
        <ErrorState requestId={result.error.requestId} action={<ReloadButton />} />
      )}
      <Link
        href="/verify"
        className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {v.checkAnother}
      </Link>
    </section>
  );
}
