import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { PasswordLinksService } from '../auth/password-links.service';
import { ApiException } from '../common/errors/api-exception';
import { isUniqueViolation } from '../prisma/errors';
import { PrismaService } from '../prisma/prisma.service';

/*
 * Global user identities (domain model §2). Slice 2.3c creates accounts only through the operator command (D-083);
 * invitations (Phase 3) will call the same `createWithSetupLink`. An account starts without a password; its
 * set-password email is queued in the same transaction, so a user never exists without a way in.
 */

export const NewUser = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((e) => e.normalize('NFKC').toLowerCase()),
    // No control or invisible formatting characters (newlines, NUL, right-to-left overrides, zero-width): names
    // reach emails, CSV exports and audit views (security review 2.3c). The zero-width joiner stays for emoji.
    displayName: z
      .string()
      .transform((n) => n.normalize('NFC').trim())
      .pipe(
        z
          .string()
          .min(1)
          .max(120)
          .refine(
            (n) => !/[\p{Cc}\p{Cf}]/u.test(n.replaceAll('\u200d', '')),
            'contains control or invisible characters',
          ),
      ),
  })
  .strict();

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwordLinks: PasswordLinksService,
  ) {}

  /** Creates an account (no password, address unverified) and queues its set-password email. */
  async createWithSetupLink(
    input: z.input<typeof NewUser>,
    actor: { userId: string | null; requestId: string | null; reason: string },
  ) {
    const { email, displayName } = NewUser.parse(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email, displayName, createdById: actor.userId },
          select: { id: true, email: true, displayName: true },
        });
        await this.audit.record(tx, {
          actorUserId: actor.userId,
          action: 'user.created',
          entityType: 'user',
          entityId: user.id,
          requestId: actor.requestId,
          reason: actor.reason,
        });
        await this.passwordLinks.requestSetup(tx, user.id);
        return user;
      });
    } catch (err) {
      if (isUniqueViolation(err, 'users_email_key')) {
        throw ApiException.validation([
          { field: 'email', code: 'taken', message: 'An account with this email already exists' },
        ]);
      }
      throw err;
    }
  }
}
