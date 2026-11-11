import { cache } from 'react';
import { DEMO_USER_ID, demoTenantForSlug } from '@/mocks/demo-session';
import { getSession } from './session';
import type { SessionView } from './session-types';

/**
 * The session the sample-data fetchers read (D-110). Demo sessions as they are; a real session with demo content on is
 * mapped onto the fixtures — its tenant onto a demo tenant (by slug) and the user onto the demo learner — keeping its
 * real role, name and permissions. Anything that authorizes or reads real records uses `getSession`, never this.
 */
export const getContentSession = cache(async function getContentSession(): Promise<SessionView> {
  const session = await getSession();
  if (session.demo || !session.demoContent) return session;
  return {
    ...session,
    activeTenantId: session.activeTenantId ? demoTenantForSlug(session.activeTenantSlug) : null,
    user: { ...session.user, id: DEMO_USER_ID },
  };
});
