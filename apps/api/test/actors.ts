import type { IncomingMessage } from 'node:http';
import type { PlatformPermission, TenantPermission } from '../src/access/permissions';
import type { BranchScope, ContextResolver, RequestContext } from '../src/access/request-context';

/*
 * Test-only callers. Until sessions exist (Slice 2.3), integration tests choose who is calling with an
 * `x-test-actor` header; this resolver is passed to the app only in tests — the real app has no sessions yet and
 * answers 401. Permission sets mirror docs/ROLE_PERMISSION_MATRIX.md for the keys enforced so far.
 */

export const TEST_ACTOR_HEADER = 'x-test-actor';

type ActorSpec = {
  userId: string;
  platform?: PlatformPermission[];
  tenant?: { tenantId: string; permissions: TenantPermission[]; branchScope: BranchScope };
};

export class TestActors implements ContextResolver {
  private readonly actors = new Map<string, ActorSpec>();

  set(name: string, spec: ActorSpec) {
    this.actors.set(name, spec);
    return this;
  }

  async resolve(req: IncomingMessage, requestId: string): Promise<RequestContext | null> {
    const name = req.headers[TEST_ACTOR_HEADER];
    const spec = typeof name === 'string' ? this.actors.get(name) : undefined;
    if (!spec) return null;
    return {
      requestId,
      userId: spec.userId,
      platform: spec.platform ? { permissions: new Set(spec.platform) } : null,
      tenant: spec.tenant
        ? {
            tenantId: spec.tenant.tenantId,
            permissions: new Set(spec.tenant.permissions),
            branchScope: spec.tenant.branchScope,
          }
        : null,
    };
  }
}

export const PLATFORM_ADMIN: PlatformPermission[] = [
  'tenant.create',
  'tenant.read',
  'tenant.update',
  'tenant.suspend',
  'tenant.archive',
];
export const TENANT_ADMIN: TenantPermission[] = [
  'branch.read',
  'branch.create',
  'branch.update',
  'branch.deactivate',
];
/** Branch Admin: reads own branches only; cannot create, update or deactivate branches (matrix rows branch.*). */
export const BRANCH_ADMIN: TenantPermission[] = ['branch.read'];

export const USER = {
  platformAdmin: '01900000-0000-7000-8000-000000000001',
  tenantAdminA: '01900000-0000-7000-8000-00000000000a',
  tenantAdminB: '01900000-0000-7000-8000-00000000000b',
  branchAdminA1: '01900000-0000-7000-8000-0000000000a1',
  learnerA: '01900000-0000-7000-8000-0000000000c1',
} as const;
