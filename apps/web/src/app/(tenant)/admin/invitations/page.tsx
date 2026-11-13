import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { PermissionDenied } from '@/components/permission-denied';
import { Button } from '@/components/ui/button';
import { InvitationList } from '@/features/invitations/invitation-list';
import { RealDataOnly } from '@/features/people/real-data-only';
import { readInvitations } from '@/lib/api/invitations-server';
import { readBranchOptions } from '@/lib/api/people-server';
import { getSession } from '@/lib/api/session';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();

export const metadata: Metadata = { title: t.invitations.title };

// Per request: the list comes from the API with the caller's session and scope.
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Invitations (Slice 3.1): Tenant Admins (whole organisation) and Branch Admins (their branches). The API applies
 * tenant and branch scope; the permission check here only picks the state to show.
 */
export default async function InvitationsPage({ searchParams }: Props) {
  const session = await getSession();
  if (session.demo) return <RealDataOnly />;
  const perms = new Set(session.permissions);
  if (!perms.has('invitation.read')) return <PermissionDenied headingLevel="h1" />;
  const [initial, branches] = await Promise.all([
    readInvitations(),
    perms.has('branch.read') ? readBranchOptions() : null,
  ]);
  if (!initial.ok && initial.status === 403) return <PermissionDenied headingLevel="h1" />;
  const sent = (await searchParams).sent;
  return (
    <>
      <PageHeader
        title={t.invitations.title}
        description={t.invitations.description}
        actions={
          perms.has('invitation.create') ? (
            <Button asChild>
              <Link href="/admin/invitations/new">{t.invitations.invite}</Link>
            </Button>
          ) : null
        }
      />
      <InvitationList
        initial={initial}
        justSent={typeof sent === 'string' ? sent : null}
        branches={
          branches?.ok
            ? branches.data.data.map((b) => ({ id: b.id, label: `${b.name} (${b.code})` }))
            : []
        }
      />
    </>
  );
}
