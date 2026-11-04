import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { AuditLog } from '@/features/audit/audit-log';
import { RealDataOnly } from '@/features/people/real-data-only';
import { readAuditEvents } from '@/lib/api/audit-server';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const a = t.auditLog;

export const metadata: Metadata = { title: a.title };

export const dynamic = 'force-dynamic';

/** The organisation's audit log (Slice 2.6a; `audit.read`; D-099, D-109). The API scopes and pages it. */
export default async function AuditPage() {
  const session = await getSession();
  if (session.demo) return <RealDataOnly />;
  if (!session.permissions.includes('audit.read')) return <PermissionDenied headingLevel="h1" />;
  const initial = await readAuditEvents();
  if (!initial.ok && initial.status === 403) return <PermissionDenied headingLevel="h1" />;
  return (
    <>
      <PageHeader title={a.title} description={a.description} />
      {/* Branch-scoped readers (D-109): say what they do not see. */}
      {session.branchScope ? (
        <p className="max-w-2xl text-sm text-muted-foreground">{a.branchScopeNote}</p>
      ) : null}
      <AuditLog initial={initial} />
    </>
  );
}
