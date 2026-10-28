import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiException } from '../common/errors/api-exception';
import { requestIdOf } from '../common/request-id';
import type { PlatformPermission, TenantPermission } from './permissions';
import { CONTEXT_RESOLVER, type ContextResolver, type WithContext } from './request-context';

export const PUBLIC = 'vl:public';
export const REQUIRES = 'vl:requires';

export type Requirement =
  | { scope: 'platform'; permission: PlatformPermission }
  | { scope: 'tenant'; permission: TenantPermission };

/** No authentication: probes, public verification, webhooks. Return minimal data from these. */
export const Public = () => SetMetadata(PUBLIC, true);

/** Platform staff route (`/api/v1/platform/**`); tenant roles never pass. */
export const RequirePlatformPermission = (permission: PlatformPermission) =>
  applyDecorators(SetMetadata(REQUIRES, { scope: 'platform', permission } satisfies Requirement));

/** Tenant route: the caller's active membership must hold the permission; services still apply branch scope. */
export const RequireTenantPermission = (permission: TenantPermission) =>
  applyDecorators(SetMetadata(REQUIRES, { scope: 'tenant', permission } satisfies Requirement));

/**
 * Global guard, deny by default (CLAUDE.md): a route is reachable only when it is explicitly `@Public()` or names the
 * permission it needs. No context → 401; context without the permission → 403. Hiding a button is never enough.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CONTEXT_RESOLVER) private readonly resolver: ContextResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
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

    const req = context.switchToHttp().getRequest<WithContext>();
    const ctx = await this.resolver.resolve(req, requestIdOf(req));
    if (!ctx) throw new ApiException(401, 'UNAUTHENTICATED', 'Not signed in');

    const allowed =
      requirement.scope === 'platform'
        ? (ctx.platform?.permissions.has(requirement.permission) ?? false)
        : (ctx.tenant?.permissions.has(requirement.permission) ?? false);
    if (!allowed) throw new ApiException(403, 'FORBIDDEN', 'Forbidden');
    req.vlContext = ctx;
    return true;
  }
}
