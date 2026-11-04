import { PageLoading } from '@/components/page-loading';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export default function Loading() {
  return <PageLoading label={t.auditLog.loading} rows={8} />;
}
