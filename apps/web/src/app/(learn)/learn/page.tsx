import type { Metadata } from 'next';
import { DemoBadge } from '@/components/demo-badge';
import { ErrorState } from '@/components/error-state';
import { KpiCard } from '@/components/kpi-card';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { LearnerDashboard } from '@/features/learn/learner-dashboard';
import { parseDemoState } from '@/lib/api/client';
import { getLearnerDashboard } from '@/lib/api/learner';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const l = t.learnerDashboard;

export const metadata: Metadata = { title: t.nav.dashboard };

type Props = { searchParams: Promise<{ demoState?: string }> };

/** Learner dashboard (UI spec #39). The learner's own enrollments only; the session decides whose. */
export default async function LearnerDashboardPage({ searchParams }: Props) {
  const session = await getSession();
  const demoState = session.demo ? parseDemoState((await searchParams).demoState) : 'ready';
  const header = (
    <PageHeader
      title={l.title(session.user.displayName)}
      description={l.description}
      meta={session.demo ? <DemoBadge /> : null}
    />
  );
  if (demoState === 'loading') {
    return (
      <>
        {header}
        <div
          role="status"
          aria-label={t.common.loading}
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          {[l.notStarted, l.inProgress, l.overdue, l.completed].map((label) => (
            <KpiCard key={label} label={label} loading />
          ))}
        </div>
      </>
    );
  }
  const result = await getLearnerDashboard({ demoState });
  if (!result.ok) {
    return result.status === 403 ? (
      <PermissionDenied headingLevel="h1" />
    ) : (
      <>
        {header}
        <ErrorState requestId={result.error.requestId} />
      </>
    );
  }
  return (
    <>
      {header}
      <LearnerDashboard data={result.data} demo={session.demo} />
    </>
  );
}
