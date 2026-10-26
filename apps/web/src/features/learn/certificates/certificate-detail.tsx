import Link from 'next/link';
import { ArrowRight, CircleAlert, Download, FlaskConical } from 'lucide-react';
import type { CertificateDetail as CertificateDetailData } from '@vachelearn/contracts';
import { BrandLogo } from '@/components/shell/brand-logo';
import { NotConnectedAction } from '@/features/learn/player/not-connected-action';
import { formatDate } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { CopyLink } from './copy-link';
import { certificateHref, verificationPath } from './paths';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const c = t.certificates;

/**
 * One of the learner's own certificates (UI spec #43, ref 05 panel 7): an on-screen preview labelled as a demo preview
 * (the PDF is the official copy, D-074), its details, and the public verification link. A certificate that is not valid
 * says so in words above the preview, which is also marked, so it cannot be mistaken for a valid one.
 */
export function CertificateDetail({
  data,
  origin,
}: {
  data: CertificateDetailData;
  /** This site's origin, so the printed verification address is complete. */
  origin: string;
}) {
  const { award, timeZone } = data;
  const date = (instant: string) => formatDate(instant, { timeZone });
  const notice =
    award.status === 'expired' && award.expiresAt
      ? c.statusNotice.expired(date(award.expiresAt))
      : award.status === 'revoked' && award.revokedAt
        ? c.statusNotice.revoked(date(award.revokedAt))
        : award.status === 'superseded' && award.supersededAt
          ? c.statusNotice.superseded(date(award.supersededAt))
          : null;
  const verifyPath = verificationPath(award.verificationId);

  return (
    <div className="flex flex-col gap-6">
      {notice ? (
        <div
          role="note"
          className="flex flex-col gap-2 rounded-lg border border-danger/40 bg-danger-subtle px-4 py-3 text-sm font-medium text-danger sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex items-start gap-2">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {notice}
          </span>
          {award.replacedByAwardId ? (
            <Link
              href={certificateHref(award.replacedByAwardId)}
              className="underline underline-offset-4"
            >
              {c.viewCurrent}
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <figure className="flex flex-col gap-2">
          <figcaption className="flex items-center gap-2 text-sm font-medium text-warning">
            <FlaskConical aria-hidden="true" className="size-4 shrink-0" />
            {c.previewNote}
          </figcaption>
          <section
            aria-label={c.previewLabel}
            data-slot="certificate-preview"
            className={cn(
              'relative flex flex-col items-center gap-3 overflow-hidden rounded-xl border-4 border-double border-primary bg-card px-4 py-8 text-center sm:px-10',
              award.status !== 'valid' && 'opacity-80',
            )}
          >
            {award.status !== 'valid' ? (
              <span
                aria-hidden="true"
                className="absolute top-4 right-4 rounded-md border-2 border-danger px-2 py-0.5 text-xs font-bold tracking-wider text-danger uppercase"
              >
                {t.status.certificate[award.status]}
              </span>
            ) : null}
            <BrandLogo />
            <p className="text-sm font-medium text-muted-foreground">{data.issuerName}</p>
            <h2 className="text-2xl font-semibold text-primary sm:text-3xl">{c.previewHeading}</h2>
            <p className="text-sm text-muted-foreground">{c.certifies}</p>
            <p className="text-2xl font-semibold wrap-break-word">{data.holderName}</p>
            <p className="text-sm text-muted-foreground">{c.completedCourse}</p>
            <p className="text-lg font-semibold wrap-break-word">{award.courseTitle}</p>
            <p className="text-xs text-muted-foreground">{c.version(award.courseVersion)}</p>
            <dl className="mt-2 grid w-full grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">{c.completedLabel}</dt>
                <dd className="font-medium">{date(award.completedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{c.issuedLabel}</dt>
                <dd className="font-medium">{date(award.issuedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {award.expiresAt ? c.validUntilLabel : c.validityLabel}
                </dt>
                <dd className="font-medium">
                  {award.expiresAt ? date(award.expiresAt) : c.noExpiry}
                </dd>
              </div>
            </dl>
            <p className="text-xs">
              {c.certificateIdLabel}:{' '}
              <span className="font-mono font-medium">{award.verificationId}</span>
            </p>
            <p className="text-xs wrap-anywhere text-muted-foreground">
              {c.verifyAt(`${origin}/verify`)}
            </p>
          </section>
        </figure>

        <section
          aria-labelledby="details-heading"
          className="flex flex-col gap-4 rounded-xl border bg-card p-4"
        >
          <h2 id="details-heading" className="text-base font-semibold">
            {c.detailsTitle}
          </h2>
          <dl className="flex flex-col gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{c.courseLabel}</dt>
              <dd className="font-medium">
                {award.courseTitle} · {c.version(award.courseVersion)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{c.issuerLabel}</dt>
              <dd className="font-medium">{data.issuerName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{c.certificateIdLabel}</dt>
              <dd className="font-mono font-medium">{award.verificationId}</dd>
            </div>
          </dl>
          <NotConnectedAction
            label={c.download}
            message={c.downloadNotConnected}
            icon={<Download aria-hidden="true" />}
          />
          <CopyLink path={verifyPath} />
          <Link
            href={verifyPath}
            className="flex w-fit items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {c.openVerification}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </section>
      </div>
    </div>
  );
}
