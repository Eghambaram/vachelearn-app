import Link from 'next/link';
import { Award } from 'lucide-react';
import type { MyCertificates } from '@vachelearn/contracts';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import { certificateHref } from './paths';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const c = t.certificates;

/** The learner's own awards (UI spec #43). Revoked and superseded awards stay listed: evidence is never removed. */
export function CertificateList({ data }: { data: MyCertificates }) {
  if (data.data.length === 0) {
    return <EmptyState icon={<Award />} title={c.emptyTitle} description={c.emptyBody} />;
  }
  const date = (instant: string) => formatDate(instant, { timeZone: data.timeZone });
  return (
    <ul aria-label={c.listLabel} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {data.data.map((item) => (
        <li key={item.awardId}>
          <Card className="h-full px-(--card-spacing)">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold">{item.courseTitle}</h2>
              <StatusBadge entity="certificate" status={item.status} />
            </div>
            <p className="text-xs text-muted-foreground">{c.version(item.courseVersion)}</p>
            <p className="text-sm">{c.issuedOn(date(item.issuedAt))}</p>
            <p className="text-sm text-muted-foreground">
              {item.expiresAt === null
                ? c.noExpiry
                : item.status === 'expired'
                  ? c.expiredOn(date(item.expiresAt))
                  : c.validUntil(date(item.expiresAt))}
            </p>
            <p className="text-xs text-muted-foreground">
              {t.certificates.certificateIdLabel}:{' '}
              <span className="font-mono">{item.verificationId}</span>
            </p>
            <Link
              href={certificateHref(item.awardId)}
              className="mt-auto w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {c.view}
              <span className="sr-only">
                {' '}
                ({item.courseTitle}, {t.status.certificate[item.status]})
              </span>
            </Link>
          </Card>
        </li>
      ))}
    </ul>
  );
}
