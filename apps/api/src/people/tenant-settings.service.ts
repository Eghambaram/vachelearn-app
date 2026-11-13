import { Injectable } from '@nestjs/common';
import type { TenantSettingsView, UpdateTenantSettingsBody } from '@vachelearn/contracts';
import type { z } from 'zod';
import type { RequestContext } from '../access/request-context';
import { AuditService, changedFields } from '../audit/audit.service';
import { ApiException } from '../common/errors/api-exception';
import { PrismaService } from '../prisma/prisma.service';
import { conflict } from '../tenancy/tenants.service';

/*
 * The caller's own tenant settings (Slice 2.5a; invitation validity 3.1, D-050): name, default time zone and locale,
 * how long invitation links stay valid, edited by a Tenant Admin
 * (`tenant_settings.update`) with the same version as platform edits of the tenant; feature switches are read-only
 * here (platform staff set them, D-031). The tenant is the session's, never a parameter. Changes are audited.
 */

const SELECT = {
  displayName: true,
  slug: true,
  defaultTimezone: true,
  defaultLocale: true,
  version: true,
  updatedAt: true,
  settings: {
    select: {
      classroomEnabled: true,
      surveysEnabled: true,
      commerceEnabled: true,
      publicCatalogEnabled: true,
      analyticsEnabled: true,
      invitationExpiryDays: true,
    },
  },
} as const;

type Row = {
  displayName: string;
  slug: string;
  defaultTimezone: string;
  defaultLocale: string;
  version: number;
  updatedAt: Date;
  settings: {
    classroomEnabled: boolean;
    surveysEnabled: boolean;
    commerceEnabled: boolean;
    publicCatalogEnabled: boolean;
    analyticsEnabled: boolean;
    invitationExpiryDays: number;
  } | null;
};

/** D-050 default, also when a tenant has no settings row yet. */
export const DEFAULT_INVITATION_EXPIRY_DAYS = 7;

function toView(t: Row): TenantSettingsView {
  return {
    displayName: t.displayName,
    slug: t.slug,
    defaultTimezone: t.defaultTimezone,
    defaultLocale: t.defaultLocale,
    invitationExpiryDays: t.settings?.invitationExpiryDays ?? DEFAULT_INVITATION_EXPIRY_DAYS,
    features: {
      classroom: t.settings?.classroomEnabled ?? false,
      surveys: t.settings?.surveysEnabled ?? false,
      commerce: t.settings?.commerceEnabled ?? false,
      publicCatalog: t.settings?.publicCatalogEnabled ?? false,
      analytics: t.settings?.analyticsEnabled ?? false,
    },
    version: t.version,
    updatedAt: t.updatedAt.toISOString(),
  };
}

function tenantOf(ctx: RequestContext) {
  if (!ctx.tenant) throw ApiException.notFound();
  return ctx.tenant.tenantId;
}

@Injectable()
export class TenantSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(ctx: RequestContext): Promise<TenantSettingsView> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantOf(ctx) },
      select: SELECT,
    });
    if (!tenant) throw ApiException.notFound();
    return toView(tenant);
  }

  async update(
    ctx: RequestContext,
    input: z.output<typeof UpdateTenantSettingsBody>,
  ): Promise<TenantSettingsView> {
    const tenantId = tenantOf(ctx);
    const { version, invitationExpiryDays, ...tenantPatch } = input;
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.tenant.findUnique({ where: { id: tenantId }, select: SELECT });
      if (!current) throw ApiException.notFound();
      if (current.version !== version) throw conflict();
      const flat = {
        ...current,
        invitationExpiryDays:
          current.settings?.invitationExpiryDays ?? DEFAULT_INVITATION_EXPIRY_DAYS,
      };
      const diff = changedFields(flat, {
        ...tenantPatch,
        ...(invitationExpiryDays === undefined ? {} : { invitationExpiryDays }),
      });
      // One version for the whole settings screen: the tenant row carries it, also for a settings-only change.
      const result = await tx.tenant.updateMany({
        where: { id: tenantId, version, status: 'active' },
        data: { ...tenantPatch, version: { increment: 1 } },
      });
      if (result.count === 0) throw conflict();
      if (invitationExpiryDays !== undefined) {
        await tx.tenantSetting.upsert({
          where: { tenantId },
          create: { tenantId, invitationExpiryDays },
          update: { invitationExpiryDays },
        });
      }
      if (diff.changed) {
        await this.audit.record(tx, {
          actorUserId: ctx.userId,
          tenantId,
          action: 'tenant_settings.updated',
          entityType: 'tenant',
          entityId: tenantId,
          requestId: ctx.requestId,
          before: diff.before,
          after: diff.after,
        });
      }
      return tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: SELECT });
    });
    return toView(updated);
  }
}
