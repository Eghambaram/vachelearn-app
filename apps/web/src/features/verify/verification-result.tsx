import { CircleAlert, CircleCheck, Clock, History } from 'lucide-react';
import type { CertificateVerification } from '@vachelearn/contracts';
import { StatusBadge } from '@/components/status-badge';
import { formatDateOnly, formatDateTime } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import { cn } from '@/lib/utils';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const v = t.verify;

/**
 * Public verification result (UI spec #43, D-017): the status in words first, then only the fields D-017 allows — a
 * masked holder name, course, issuer and dates. A revoked certificate shows its date, never the reason.
 */
export function VerificationResult({ data }: { data: CertificateVerification }) {
  const valid = data.status === 'valid';
  const headline =
    data.status === 'valid'
      ? v.status.valid
      : data.status === 'expired'
        ? v.status.expired(formatDateOnly(data.expiresOn!))
        : data.status === 'revoked'
          ? v.status.revoked(formatDateOnly(data.revokedOn!))
          : v.status.superseded;
  const Icon =
    data.status === 'valid'
      ? CircleCheck
      : data.status === 'expired'
        ? Clock
        : data.status === 'superseded'
          ? History
          : CircleAlert;

  return (
    <section
      aria-labelledby="verification-status"
      className="flex flex-col gap-5 rounded-xl border bg-card p-4 sm:p-6"
    >
      <div
        className={cn(
          'flex items-start gap-3 rounded-lg px-4 py-3',
          valid ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger',
        )}
      >
        <Icon aria-hidden="true" className="mt-0.5 size-6 shrink-0" />
        <div className="flex flex-col gap-1">
          <p id="verification-status" className="text-lg font-semibold">
            {headline}
          </p>
          <StatusBadge entity="certificate" status={data.status} />
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">{v.holderLabel}</dt>
          <dd className="font-medium">{data.holderMaskedName}</dd>
          <dd className="text-xs text-muted-foreground">{v.holderNote}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{v.courseLabel}</dt>
          <dd className="font-medium">{data.courseTitle}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{v.issuerLabel}</dt>
          <dd className="font-medium">{data.issuerName}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{v.issuedLabel}</dt>
          <dd className="font-medium">{formatDateOnly(data.issuedOn)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{v.validUntilLabel}</dt>
          <dd className="font-medium">
            {data.expiresOn ? formatDateOnly(data.expiresOn) : v.noExpiry}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t.certificates.certificateIdLabel}</dt>
          <dd className="font-mono font-medium">{data.verificationId}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">{v.checkedAt(formatDateTime(data.checkedAt))}</p>
    </section>
  );
}
