import { AuditEventListPage } from '@vachelearn/contracts';
import { queryString } from './browser';
import { serverRead } from './server';

/** First page of the tenant audit log for the server render (Slice 2.6a). */
export const readAuditEvents = (query: Record<string, string | undefined> = {}) =>
  serverRead(`/audit-events${queryString(query)}`, (d) => AuditEventListPage.parse(d));
