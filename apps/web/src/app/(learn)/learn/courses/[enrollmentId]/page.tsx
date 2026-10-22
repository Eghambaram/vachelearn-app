import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PlayCircle } from 'lucide-react';
import { DemoBadge } from '@/components/demo-badge';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { Button } from '@/components/ui/button';
import { getMyEnrollment } from '@/lib/api/learner';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

type Props = { params: Promise<{ enrollmentId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await getMyEnrollment((await params).enrollmentId);
  return { title: result.ok ? result.data.courseTitle : t.system.notFoundTitle };
}

/**
 * Target of "Continue" until the course player (slice 1.5.5). It already enforces the rule the player needs: only the
 * learner's own enrollment opens; anyone else's id is a 404.
 */
export default async function CoursePlayerStub({ params }: Props) {
  const session = await getSession();
  const result = await getMyEnrollment((await params).enrollmentId);
  if (!result.ok) {
    if (result.status === 404) notFound();
    return <PermissionDenied headingLevel="h1" />;
  }
  return (
    <>
      <PageHeader
        title={result.data.courseTitle}
        breadcrumbs={[
          { label: t.nav.dashboard, href: '/learn' },
          { label: result.data.courseTitle },
        ]}
        meta={session.demo ? <DemoBadge /> : null}
        description={t.learnerDashboard.version(result.data.courseVersion)}
      />
      <EmptyState
        icon={<PlayCircle />}
        title={t.playerStub.heading}
        description={t.playerStub.body}
        action={
          <Button asChild variant="outline">
            <Link href="/learn">{t.playerStub.back}</Link>
          </Button>
        }
      />
    </>
  );
}
