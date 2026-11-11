import type { Metadata } from 'next';
import { DemoBadge } from '@/components/demo-badge';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { notAvailableForRealSession } from '@/components/shell/workspace';
import {
  MY_LEARNING_FILTERS,
  MyLearning,
  type MyLearningFilter,
} from '@/features/learn/my-learning';
import { getMyLearning } from '@/lib/api/learner';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.myLearning.title };

type Props = { searchParams: Promise<{ status?: string }> };

/** My learning (UI spec #40): the learner's own enrolments (sample data until Phase 4, D-110). */
export default async function MyLearningPage({ searchParams }: Props) {
  // Real sessions see sample data only while demo content is on (D-097, D-110).
  const notAvailable = await notAvailableForRealSession('/learn/my-learning');
  if (notAvailable) return notAvailable;
  const session = await getSession();
  const result = await getMyLearning();
  if (!result.ok) return <PermissionDenied headingLevel="h1" />;
  const status = (await searchParams).status;
  const filter: MyLearningFilter = MY_LEARNING_FILTERS.includes(status as MyLearningFilter)
    ? (status as MyLearningFilter)
    : 'all';
  return (
    <>
      <PageHeader
        title={t.myLearning.title}
        description={t.myLearning.description}
        meta={session.demoContent ? <DemoBadge /> : null}
      />
      <MyLearning filter={filter} {...result.data} />
    </>
  );
}
