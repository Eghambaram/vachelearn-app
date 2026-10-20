'use client';

import Link from 'next/link';
import type { RecentTenant } from '@vachelearn/contracts';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { DemoBadge } from '@/components/demo-badge';
import { StatusBadge } from '@/components/status-badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatDateTime, formatNumber } from '@/lib/format';
import { getMessages } from '@/lib/i18n';

// English only for now (D-028); becomes per-request when a second language is added.
const t = getMessages();
const r = t.platformDashboard.recent;

function columnsFor(timeZone: string): DataTableColumn<RecentTenant>[] {
  return [
    {
      id: 'name',
      header: r.name,
      cell: (row) => <span className="font-medium">{row.displayName}</span>,
    },
    {
      id: 'status',
      header: r.status,
      cell: (row) => <StatusBadge entity="tenant" status={row.status} />,
    },
    {
      id: 'learners',
      header: r.learners,
      cell: (row) => formatNumber(row.learnerCount),
      align: 'end',
    },
    {
      id: 'created',
      header: r.created,
      cell: (row) => formatDateTime(row.createdAt, { timeZone }),
    },
  ];
}

export function RecentTenants({
  tenants,
  timeZone,
  demo,
}: {
  tenants: readonly RecentTenant[];
  timeZone: string;
  demo: boolean;
}) {
  const columns = columnsFor(timeZone);
  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto]">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">{r.title}</h2>
          {demo ? <DemoBadge /> : null}
        </div>
        <Link
          href="/platform/tenants"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {r.viewAll}
        </Link>
      </CardHeader>
      <CardContent>
        <DataTable<RecentTenant>
          caption={r.caption}
          columns={columns}
          rows={tenants}
          getRowId={(row) => row.id}
          getRowLabel={(row) => row.displayName}
          empty={{ title: r.emptyTitle, description: r.emptyDescription }}
        />
      </CardContent>
    </Card>
  );
}
