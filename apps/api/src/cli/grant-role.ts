import { hostname, userInfo } from 'node:os';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { MembershipsService } from '../access/memberships.service';
import {
  PLATFORM_ROLES,
  TENANT_ROLES,
  type PlatformRole,
  type TenantRole,
} from '../access/permissions';
import { AppModule } from '../app.module';
import { ApiException } from '../common/errors/api-exception';
import { loadConfig } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/*
 * Operator command (Slice 2.4a): grants a fixed role (D-053) to an existing account — a tenant role in one tenant,
 * optionally on one branch, or the platform role. The membership and branch membership are created when missing.
 * Until the role-assignment API (2.4b) and invitations (Phase 3) exist, this is how the first Tenant Admin and the
 * platform admin get their roles. Audited with the OS user, host and the reason.
 *
 *   pnpm --filter api user:grant --email a@example.com --role tenant_admin --tenant demo-co --reason "First admin"
 *   pnpm --filter api user:grant --email a@example.com --role branch_admin --tenant demo-co --branch A1 --reason "…"
 *   pnpm --filter api user:grant --email a@example.com --role platform_super_admin --reason "…"
 */

const USAGE =
  'Usage: user:grant --email <address> --role <role> [--tenant <slug> [--branch <code>]] --reason "<why>"\n' +
  `Roles: ${[...Object.keys(PLATFORM_ROLES), ...Object.keys(TENANT_ROLES)].join(', ')}`;

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      role: { type: 'string' },
      tenant: { type: 'string' },
      branch: { type: 'string' },
      reason: { type: 'string' },
    },
    strict: true,
  });
  const role = values.role ?? '';
  const isPlatform = Object.hasOwn(PLATFORM_ROLES, role);
  const isTenant = Object.hasOwn(TENANT_ROLES, role);
  if (
    !values.email ||
    !values.reason ||
    values.reason.trim().length < 3 ||
    (!isPlatform && !isTenant) ||
    (isTenant && !values.tenant) ||
    (isPlatform && (values.tenant || values.branch))
  ) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  const config = loadConfig({ ...process.env, JOBS_WORKER: 'false', LOG_LEVEL: 'warn' });
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), {
    logger: ['error', 'warn'],
  });
  const actor = {
    userId: null,
    requestId: null,
    reason: `user:grant by ${userInfo().username}@${hostname()}: ${values.reason.trim()}`.slice(
      0,
      500,
    ),
  };
  try {
    const prisma = app.get(PrismaService);
    const user = await prisma.user.findUnique({
      where: { email: values.email.normalize('NFKC').toLowerCase() },
      select: { id: true, email: true },
    });
    if (!user) return fail(`No account for ${values.email}. Create it first with user:create.`);

    if (isPlatform) {
      const result = await app
        .get(MembershipsService)
        .operatorGrantPlatformRole({ userId: user.id, role: role as PlatformRole }, actor);
      console.log(`${result.created ? 'Granted' : 'Already held'}: ${role} for ${user.email}.`);
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { slug: values.tenant! },
      select: { id: true, status: true },
    });
    if (!tenant) return fail(`No tenant with slug ${values.tenant}.`);
    if (tenant.status === 'archived') return fail('The tenant is archived.');
    let branchId: string | null = null;
    if (values.branch) {
      const branch = await prisma.branch.findFirst({
        where: { tenantId: tenant.id, code: values.branch.toUpperCase(), status: 'active' },
        select: { id: true },
      });
      if (!branch) return fail(`No active branch ${values.branch} in ${values.tenant}.`);
      branchId = branch.id;
    }
    const result = await app
      .get(MembershipsService)
      .operatorGrantTenantRole(
        { userId: user.id, tenantId: tenant.id, role: role as TenantRole, branchId },
        actor,
      );
    console.log(
      `${result.created ? 'Granted' : 'Already held'}: ${role}${values.branch ? ` on ${values.branch.toUpperCase()}` : ' (whole tenant)'} in ${values.tenant} for ${user.email}.`,
    );
  } catch (err) {
    if (err instanceof ApiException) {
      return fail(err.fieldErrors?.map((f) => f.message).join('\n') ?? err.message);
    }
    throw err;
  } finally {
    await app.close();
  }
}

function fail(message: string) {
  console.error(message);
  process.exitCode = 1;
}

void main();
