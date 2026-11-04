import { AuditEventListPage, type AuditEventListQuery } from '@vachelearn/contracts';
import { call, queryString } from './browser';

/** The tenant audit log from the browser (Slice 2.6a): read-only; the tenant and scope are the session's. */
export const listAuditEvents = (query: AuditEventListQuery) =>
  call(
    `/audit-events${queryString({ ...query, limit: query.limit === undefined ? undefined : Number(query.limit) })}`,
    { method: 'GET' },
    (d) => AuditEventListPage.parse(d),
  );
