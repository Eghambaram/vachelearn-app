import { Skeleton } from '@/components/ui/skeleton';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

/** While a server-rendered admin page waits for the API: placeholder blocks, and `label` announced once. */
export function PageLoading({
  label = t.common.loading,
  rows = 6,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
