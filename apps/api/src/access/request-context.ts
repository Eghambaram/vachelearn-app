import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import type { PlatformPermission, TenantPermission } from './permissions';

/*
 * Who is calling, resolved from the authenticated session only — never from a client-sent tenant id, header, slug,
 * query or body (CLAUDE.md non-negotiable). Services receive it explicitly.
 *
 * Until identity exists (Slice 2.3), the resolver below returns no context, so every protected route answers 401 on
 * a running server. Integration tests provide a context through the same token; Slices 2.3–2.4 replace the resolver
 * with sessions + memberships + role assignments and the suspended-tenant check.
 */

export type BranchScope = 'ALL' | readonly string[];

export type RequestContext = {
  requestId: string;
  userId: string;
  /** Platform staff grants (`/api/v1/platform/**` only); null for everyone else. */
  platform: { permissions: ReadonlySet<PlatformPermission> } | null;
  /** The active tenant membership; null outside a tenant. Platform grants never imply tenant access (D-037). */
  tenant: {
    tenantId: string;
    permissions: ReadonlySet<TenantPermission>;
    /** Branches the caller may see: 'ALL' for tenant-wide roles, otherwise their branch ids. */
    branchScope: BranchScope;
  } | null;
};

export interface ContextResolver {
  resolve(req: IncomingMessage, requestId: string): Promise<RequestContext | null>;
}

export const CONTEXT_RESOLVER = Symbol('CONTEXT_RESOLVER');

/** No sessions yet (Slice 2.3): nobody is signed in, so protected routes are 401. */
export class NoSessionResolver implements ContextResolver {
  async resolve(): Promise<null> {
    return null;
  }
}

export type WithContext = IncomingMessage & { vlContext?: RequestContext };

/** The context the access guard resolved for this request (only on routes that require a permission). */
export const Ctx = createParamDecorator(
  (_data: unknown, host: ExecutionContext): RequestContext => {
    const ctx = host.switchToHttp().getRequest<WithContext>().vlContext;
    if (!ctx) throw new Error('No request context: the route is missing a permission decorator');
    return ctx;
  },
);
