import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CSRF_HEADER } from '@vachelearn/contracts';
import { timingSafeEqual } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api-exception';
import { requestIdOf } from '../common/request-id';
import type { PlatformPermission, TenantPermission } from './permissions';
import { CONTEXT_RESOLVER, type ContextResolver, type WithContext } from './request-context';

export const PUBLIC = 'vl:public';
export const REQUIRES = 'vl:requires';

export type Requirement =
  | { scope: 'platform'; permission: PlatformPermission }
  | { scope: 'tenant'; permission: TenantPermission }
  /** Any signed-in caller, no permission (own account: `/auth/me`, sign-out). */
  | { scope: 'authenticated' };

/** No authentication: probes, public verification, webhooks. Return minimal data from these. */
export const Public = () => SetMetadata(PUBLIC, true);

/** Signed-in callers only, whoever they are: for the caller's own session and account. */
export const Authenticated = () =>
  applyDecorators(SetMetadata(REQUIRES, { scope: 'authenticated' } satisfies Requirement));

/** Platform staff route (`/api/v1/platform/**`); tenant roles never pass. */
export const RequirePlatformPermission = (permission: PlatformPermission) =>
  applyDecorators(SetMetadata(REQUIRES, { scope: 'platform', permission } satisfies Requirement));

/** Tenant route: the caller's active membership must hold the permission; services still apply branch scope. */
export const RequireTenantPermission = (permission: TenantPermission) =>
  applyDecorators(SetMetadata(REQUIRES, { scope: 'tenant', permission } satisfies Requirement));

/**
 * Global guard, deny by default (CLAUDE.md): a route is reachable only when it is explicitly `@Public()`,
 * `@Authenticated()` or names the permission it needs. No context → 401; context without the permission → 403.
 * Hiding a button is never enough. Before anything else, a state-changing request must come from the web origin, and
 * a session-authenticated one must carry its CSRF token (D-085; security review 2.1).
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CONTEXT_RESOLVER) private readonly resolver: ContextResolver,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const req = context.switchToHttp().getRequest<WithContext>();
    const mutating = !SAFE_METHODS.has(req.method ?? 'GET');
    // Every state change must come from the web app's origin (D-085), public routes such as sign-in included.
    if (mutating && !this.sameOrigin(req)) {
      throw new ApiException(
        403,
        'CROSS_ORIGIN',
        'This request did not come from the VacheLearn app',
      );
    }
    // JSON only: an HTML form can send urlencoded or multipart bodies cross-site, never JSON (defence in depth).
    if (mutating && hasBody(req) && !isJson(req.headers['content-type'])) {
      throw new ApiException(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Send the request body as application/json',
      );
    }
    // A declared permission always wins: a handler that names one is enforced even inside a @Public() class.
    // (A route test fails the build when a handler has both or neither — see test/routes.test.ts.)
    const requirement = this.reflector.getAllAndOverride<Requirement | undefined>(
      REQUIRES,
      targets,
    );
    if (!requirement) {
      if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;
      throw new ApiException(403, 'FORBIDDEN', 'Forbidden');
    }

    const ctx = await this.resolver.resolve(req, requestIdOf(req));
    if (!ctx) throw new ApiException(401, 'UNAUTHENTICATED', 'Not signed in');
    // A browser session's mutations carry its CSRF token (a cross-site form cannot read it).
    if (mutating && ctx.session && !sameToken(req.headers[CSRF_HEADER], ctx.session.csrfToken)) {
      throw new ApiException(403, 'CSRF', 'Missing or invalid CSRF token');
    }

    // Support sessions are read-only (D-037), whatever the route's permission: say so before anything else.
    if (requirement.scope === 'tenant' && ctx.support && mutating) {
      throw new ApiException(403, 'SUPPORT_READ_ONLY', 'Support sessions are read-only');
    }
    if (requirement.scope === 'tenant' && ctx.tenantBlocked) {
      throw ctx.tenantBlocked === 'suspended'
        ? new ApiException(403, 'TENANT_SUSPENDED', 'This organisation is suspended')
        : new ApiException(403, 'TENANT_ARCHIVED', 'This organisation is archived');
    }
    const allowed =
      requirement.scope === 'authenticated'
        ? true
        : requirement.scope === 'platform'
          ? (ctx.platform?.permissions.has(requirement.permission) ?? false)
          : (ctx.tenant?.permissions.has(requirement.permission) ?? false);
    if (!allowed) throw new ApiException(403, 'FORBIDDEN', 'Forbidden');
    // Real callers: the branch scope is the reach of the permission this route requires — a Learner of the whole tenant
    // who is Branch Admin of A1 manages branches in A1 only.
    if (requirement.scope === 'tenant' && ctx.tenant?.grants) {
      const grant = ctx.tenant.grants.get(requirement.permission);
      ctx.tenant.branchScope =
        grant?.kind === 'all' ? 'ALL' : grant?.kind === 'branches' ? [...grant.branchIds] : [];
    }
    // Support sessions (D-037): read-only, and every tenant request audited with the session id — the tenant's audit
    // log shows what platform staff looked at. The route is named by its handler, never by URL or query.
    if (ctx.support && requirement.scope === 'tenant') {
      await this.audit.record(this.prisma, {
        actorUserId: ctx.userId,
        tenantId: ctx.support.tenantId,
        action: 'support.accessed',
        entityType: 'support_session',
        entityId: ctx.support.sessionId,
        requestId: ctx.requestId,
        supportSessionId: ctx.support.sessionId,
        after: {
          method: req.method ?? 'GET',
          route: `${context.getClass().name}.${context.getHandler().name}`,
          permission: requirement.permission,
        },
      });
    }
    req.vlContext = ctx;
    return true;
  }

  /** `Origin` equal to the web origin; without one, a browser's `Sec-Fetch-Site: same-origin`. Neither: refused. */
  private sameOrigin(req: WithContext) {
    const origin = req.headers.origin;
    if (origin !== undefined) return origin === this.config.WEB_ORIGIN;
    return req.headers['sec-fetch-site'] === 'same-origin';
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function sameToken(header: string | string[] | undefined, expected: string) {
  if (typeof header !== 'string') return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function hasBody(req: WithContext) {
  return (
    Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'] !== undefined
  );
}

function isJson(contentType: string | undefined) {
  return /^application\/json(\s*;|$)/i.test(contentType ?? '');
}
