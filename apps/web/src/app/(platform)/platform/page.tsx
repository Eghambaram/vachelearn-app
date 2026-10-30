import { ReloadButton } from '@/components/reload-button';
import type { Metadata } from 'next';
import { DashboardPeriod } from '@vachelearn/contracts';
import { DemoBadge } from '@/components/demo-badge';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import {
  PlatformDashboard,
  PlatformDashboardSkeleton,
} from '@/features/platform/dashboard/platform-dashboard';
import { PeriodFilter } from '@/components/period-filter';
import { parseDemoState } from '@/lib/api/client';
import { getPlatformDashboard } from '@/lib/api/platform';
import { getSession } from '@/lib/api/session';
import { formatDateTime } from '@/lib/format';
import { getMessages } from '@/lib/i18n';
import { notAvailableForRealSession } from '@/components/shell/workspace';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.platformDashboard.title };

type Props = { searchParams: Promise<{ period?: string; demoState?: string }> };

/** Platform Admin dashboard (UI spec #7). Demo data until slices 2.2 / 6.4 serve the same contract. */
export default async function PlatformDashboardPage({ searchParams }: Props) {
  // Real sessions never see the Phase 1 demo data on this screen (D-097).
  const notAvailable = await notAvailableForRealSession('/platform');
  if (notAvailable) return notAvailable;
  const params = await searchParams;
  const session = await getSession();
  // A junk ?period= in the URL falls back to the default instead of an error page.
  const period = DashboardPeriod.catch('30d').parse(params.period);
  // Fixture states for review (D-063); the demo layer only exists while workspaces are demo-gated.
  const demoState = session.demo ? parseDemoState(params.demoState) : 'ready';

  const header = (asOf?: string) => (
    <PageHeader
      title={t.platformDashboard.title}
      description={asOf ? t.platformDashboard.description(asOf) : undefined}
      meta={session.demo ? <DemoBadge /> : null}
      actions={<PeriodFilter value={period} />}
    />
  );

  if (!session.permissions.includes('analytics.read')) {
    return <PermissionDenied headingLevel="h1" />;
  }
  if (demoState === 'loading') {
    return (
      <>
        {header()}
        <PlatformDashboardSkeleton />
      </>
    );
  }

  const result = await getPlatformDashboard({ period }, { demoState });
  if (!result.ok) {
    return result.status === 403 ? (
      <PermissionDenied headingLevel="h1" />
    ) : (
      <>
        {header()}
        <ErrorState requestId={result.error.requestId} action={<ReloadButton />} />
      </>
    );
  }
  const { data } = result;
  return (
    <>
      {header(formatDateTime(data.generatedAt, { timeZone: data.timeZone }))}
      <PlatformDashboard data={data} demo={session.demo} />
    </>
  );
}
