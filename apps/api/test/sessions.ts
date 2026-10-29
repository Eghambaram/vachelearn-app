import type { INestApplication } from '@nestjs/common';
import { AuthSessionView, CSRF_HEADER } from '@vachelearn/contracts';
import request from 'supertest';
import type { PrismaClient } from '../generated/prisma/client';
import { MembershipsService } from '../src/access/memberships.service';
import type { TenantRole } from '../src/access/permissions';
import { WEB } from './app';

/*
 * Real callers for isolation tests (no test resolver): accounts with a known password, roles granted through the
 * operator path, and signed-in sessions that send the cookie, origin and CSRF token like the web app does.
 */

export const TEST_PASSWORD = 'correct horse battery staple';
export const OPERATOR = { userId: null, requestId: null, reason: 'test fixture' };

export function realActors(app: INestApplication, db: PrismaClient, passwordHash: string) {
  const memberships = () => app.get(MembershipsService);

  async function user(email: string) {
    return (
      await db.user.create({
        data: {
          email,
          displayName: `${email} (Demo)`,
          emailVerifiedAt: new Date(),
          credential: { create: { passwordHash, changedAt: new Date() } },
        },
      })
    ).id;
  }

  const grant = (
    userId: string,
    tenantId: string,
    role: TenantRole,
    branchId: string | null = null,
  ) => memberships().operatorGrantTenantRole({ userId, tenantId, role, branchId }, OPERATOR);

  async function signIn(email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('origin', WEB)
      .send({ email, password: TEST_PASSWORD });
    if (res.status !== 200) throw new Error(`sign-in failed: ${res.status}`);
    const cookie = String(res.headers['set-cookie']).split(';')[0]!;
    const view = AuthSessionView.parse(res.body);
    return {
      view,
      cookie,
      get: (path: string) => request(app.getHttpServer()).get(path).set('cookie', cookie),
      post: (path: string, body?: object) =>
        request(app.getHttpServer())
          .post(path)
          .set('origin', WEB)
          .set('cookie', cookie)
          .set(CSRF_HEADER, view.csrfToken)
          .send(body),
    };
  }

  return { user, grant, signIn, memberships };
}
