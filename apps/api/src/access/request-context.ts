import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import type { PlatformPermission, TenantPermission } from './permissions';

/*
 * Who is calling, resolved from the authenticated session only — never from a client-sent tenant id, header, slug,
 * query or body (CLAUDE.md non-negotiable). Services receive it explicitly.
 *
 * Slice 2.3b: the session resolver (auth/session.resolver.ts) identifies the signed-in user; platform and tenant
 * grants stay null until roles and memberships arrive (2.4), so permission routes answer 403 to real users for now.
 * Integration tests replace the resolver through the same token.
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
  /** Set when the caller is authenticated by a browser session: its mutations must carry this CSRF token. */
  session?: { id: string; csrfToken: string; expiresAt: Date };
};

export interface ContextResolver {
  resolve(req: IncomingMessage, requestId: string): Promise<RequestContext | null>;
}

export const CONTEXT_RESOLVER = Symbol('CONTEXT_RESOLVER');

export type WithContext = IncomingMessage & { vlContext?: RequestContext };

/** The context the access guard resolved (routes marked `@Authenticated()` or with a permission). */
export const Ctx = createParamDecorator(
  (_data: unknown, host: ExecutionContext): RequestContext => {
    const ctx = host.switchToHttp().getRequest<WithContext>().vlContext;
    if (!ctx) throw new Error('No request context: the route is missing an access decorator');
    return ctx;
  },
);
