import { Injectable } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import type { ContextResolver, RequestContext } from '../access/request-context';
import { SessionsService } from './sessions.service';
import { sessionTokenFrom } from './session-tokens';

/**
 * Who is calling, from the session cookie only (D-010). Slice 2.3b knows the user but grants nothing yet: platform
 * roles and tenant memberships (with branch scope and the suspended-tenant check) arrive in 2.4, so routes that need a
 * permission answer 403 to every real user until then.
 */
@Injectable()
export class SessionResolver implements ContextResolver {
  constructor(private readonly sessions: SessionsService) {}

  async resolve(req: IncomingMessage, requestId: string): Promise<RequestContext | null> {
    const token = sessionTokenFrom(req);
    if (!token) return null;
    const active = await this.sessions.resolve(token);
    if (!active) return null;
    return {
      requestId,
      userId: active.user.id,
      platform: null,
      tenant: null,
      session: {
        id: active.session.id,
        csrfToken: active.csrfToken,
        expiresAt: active.session.expiresAt,
      },
    };
  }
}
