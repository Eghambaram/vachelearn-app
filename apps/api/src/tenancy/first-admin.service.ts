import { Injectable } from '@nestjs/common';
import type { FirstAdminBody, FirstAdminResult } from '@vachelearn/contracts';
import type { z } from 'zod';
import { isPlatformStaff, lockTenant, usableTenantAdmin } from '../access/tenant-admins';
import type { RequestContext } from '../access/request-context';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/errors/api-exception';
import { isUniqueViolation } from '../prisma/errors';
import { PrismaService } from '../prisma/prisma.service';
import { NewUser, UsersService } from '../users/users.service';

/*
 * A tenant's first Tenant Admin, set up by platform staff (D-092). Platform staff have no access inside tenants
 * (D-037): this asks only whether the tenant has a usable Tenant Admin (D-095), and writes the account (if new, with
 * its set-password email, D-083), the membership and a whole-tenant Tenant Admin role — one transaction, audited.
 * Never the caller's own account nor any platform staff account (D-095): tenant access for staff is a support session
 * only. Refusals are one generic 409, so the route reveals nothing about the tenant's members.
 */

const cannotUse = () =>
  new ApiException(409, 'INVALID_STATE', 'This account cannot be made Tenant Admin here');

@Injectable()
export class FirstAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  async create(
    ctx: RequestContext,
    tenantId: string,
    input: z.output<typeof FirstAdminBody>,
  ): Promise<FirstAdminResult> {
    const { email, displayName } = NewUser.parse(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const tenant = await lockTenant(tx, tenantId);
        if (!tenant) throw ApiException.notFound();
        if (tenant.status !== 'active') {
          throw new ApiException(
            409,
            'INVALID_STATE',
            `A ${tenant.status} tenant cannot get an admin this way`,
          );
        }
        if ((await tx.roleAssignment.count({ where: usableTenantAdmin(tenantId) })) > 0) {
          throw new ApiException(409, 'TENANT_HAS_ADMIN', 'This tenant already has a Tenant Admin');
        }
        const reason = 'First Tenant Admin set up by platform staff (D-092)';
        const actor = { userId: ctx.userId, requestId: ctx.requestId, reason };

        const found = await tx.user.findUnique({
          where: { email },
          select: { id: true, status: true },
        });
        if (
          found &&
          (found.id === ctx.userId ||
            found.status !== 'active' ||
            (await isPlatformStaff(tx, found.id)))
        ) {
          throw cannotUse();
        }
        const userId =
          found?.id ?? (await this.users.createInTransaction(tx, { email, displayName }, actor)).id;
        const accountReused = Boolean(found);

        let membership = await tx.membership.findUnique({
          where: { tenantId_userId: { tenantId, userId } },
          select: { id: true, status: true },
        });
        if (membership && membership.status !== 'active') throw cannotUse();
        if (!membership) {
          membership = await tx.membership.create({
            data: { tenantId, userId, createdById: ctx.userId },
            select: { id: true, status: true },
          });
          await this.audit.record(tx, {
            actorUserId: ctx.userId,
            tenantId,
            action: 'membership.created',
            entityType: 'membership',
            entityId: membership.id,
            requestId: ctx.requestId,
            reason,
            after: { accountReused },
          });
        }
        const live = await tx.roleAssignment.findFirst({
          where: { membershipId: membership.id, role: 'tenant_admin', revokedAt: null },
          select: { id: true },
        });
        // An earlier, never-activated admin assignment for this same person is reused rather than duplicated.
        const assignment =
          live ??
          (await tx.roleAssignment.create({
            data: {
              tenantId,
              membershipId: membership.id,
              role: 'tenant_admin',
              createdById: ctx.userId,
            },
            select: { id: true },
          }));
        await this.audit.record(tx, {
          actorUserId: ctx.userId,
          tenantId,
          action: 'role.assigned',
          entityType: 'role_assignment',
          entityId: assignment.id,
          requestId: ctx.requestId,
          reason,
          after: {
            role: 'tenant_admin',
            branchId: null,
            membershipId: membership.id,
            accountReused,
          },
        });
        return {
          userId,
          membershipId: membership.id,
          assignmentId: assignment.id,
          accountCreated: !found,
        };
      });
    } catch (err) {
      // The same new address set up for two tenants at once: the second loses the race on the unique email.
      if (isUniqueViolation(err, 'users_email_key')) {
        throw new ApiException(
          409,
          'CONFLICT',
          'Try again: the account was just created elsewhere',
        );
      }
      throw err;
    }
  }
}
