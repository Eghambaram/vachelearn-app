import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import type {
  GrantScope,
  PermissionKey,
  PlatformPermission,
  TenantPermission,
} from './permissions';

/*
 * Who is calling, resolved from the authenticated session only — never from a client-sent tenant id, header, slug,
 * query or body (CLAUDE.md non-negotiable). Services receive it explicitly.
 *
 * The session resolver (auth/session.resolver.ts) builds it: platform grants from live platform roles, the tenant
 * part from the session's active membership (D-089) and its live role assignments (D-053). The access guard narrows
 * `branchScope` to the permission the route requires. Integration tests replace the resolver through the same token.
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
    /** Branches the caller may see for the route's permission: 'ALL' for tenant-wide grants, else their branch ids. */
    branchScope: BranchScope;
    /** The membership behind this context (absent for test callers). */
    membershipId?: string;
    /** Each permission's reach, from the role assignments; the guard derives `branchScope` from it. */
    grants?: ReadonlyMap<PermissionKey, GrantScope>;
  } | null;
  /** Set while platform staff work inside a support session (D-037): the tenant part is read-only and audited. */
  support?: { sessionId: string; tenantId: string };
  /** The active tenant is suspended or archived: tenant routes answer 403 (spec §4) and nothing tenant-owned is read. */
  tenantBlocked?: 'suspended' | 'archived';
  /** Set when the caller is authenticated by a browser session: its mutations must carry this CSRF token. */
  session?: { id: string; csrfToken: string; expiresAt: Date; activeMembershipId: string | null };
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
