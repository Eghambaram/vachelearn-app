import { InvitationListPage } from '@vachelearn/contracts';
import { queryString } from './browser';
import { serverRead } from './server';

/** The invitations screen's first render (Slice 3.1): the API applies tenant and branch scope. */
export const readInvitations = (query: Record<string, string | undefined> = {}) =>
  serverRead(`/invitations${queryString(query)}`, (d) => InvitationListPage.parse(d));
