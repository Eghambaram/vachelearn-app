import {
  AcceptedInvitation,
  InvitationListPage,
  InvitationPreview,
  InvitationView,
  type CreateInvitationBody,
  type InvitationListQuery,
} from '@vachelearn/contracts';
import { call, queryString } from './browser';

/*
 * Invitations from the browser (Slice 3.1) through the same-origin `/api/v1` proxy. Inviter calls name no tenant (the
 * session's) and send the session's CSRF token; the link calls carry only the token from the email's fragment.
 */

const invitation = (d: unknown) => InvitationView.parse(d);
const accepted = (d: unknown) => AcceptedInvitation.parse(d);

export const listInvitations = (query: InvitationListQuery) =>
  call(
    `/invitations${queryString({ ...query, limit: query.limit === undefined ? undefined : Number(query.limit) })}`,
    { method: 'GET' },
    (d) => InvitationListPage.parse(d),
  );

export const createInvitation = (body: CreateInvitationBody, csrfToken: string) =>
  call('/invitations', { method: 'POST', body, csrfToken }, invitation);

export const resendInvitation = (id: string, csrfToken: string) =>
  call(`/invitations/${encodeURIComponent(id)}/resend`, { method: 'POST', csrfToken }, invitation);

export const revokeInvitation = (id: string, reason: string, csrfToken: string) =>
  call(
    `/invitations/${encodeURIComponent(id)}/revoke`,
    { method: 'POST', body: { reason }, csrfToken },
    invitation,
  );

export const previewInvitation = (token: string) =>
  call('/invitations/preview', { method: 'POST', body: { token } }, (d) =>
    InvitationPreview.parse(d),
  );

export const acceptInvitation = (input: { token: string; displayName: string; password: string }) =>
  call('/invitations/accept', { method: 'POST', body: input }, accepted);

/** Signed in as the invited address (D-116). */
export const acceptInvitationSignedIn = (token: string, csrfToken: string) =>
  call('/me/invitations/accept', { method: 'POST', body: { token }, csrfToken }, accepted);
