import { Inject, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { Job } from '../../generated/prisma/client';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { defineJob, JobRegistry, PermanentJobError } from '../jobs/job-handlers';
import type { Tx } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailProvider, type EmailMessage } from './email.provider';

/*
 * Email as jobs. Each kind of email is its own job type whose payload holds ids and choices only; `compose` builds the
 * message when the job runs — that is where a verification or reset token is minted and only its hash stored (D-081),
 * so no secret ever sits in the job table, a log or a backup.
 *
 * Sending once: the attempt is recorded on the job's `email_deliveries` row in the same transaction as `compose`
 * (which mints any token), then the message is sent; a retry that finds the row `sent` stops there. The one gap no
 * mail system can close: a crash after the SMTP server accepted the message but before `sent` was recorded resends
 * it. Each attempt has its own Message-ID, because its link differs (a resend revokes the earlier link).
 */

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export type EmailJobDefinition<S extends z.ZodType> = {
  /** Job type, e.g. `email.verify_address`. */
  type: string;
  payload: S;
  /** Runs in the transaction that records this delivery attempt (D-081: mint and record together). */
  compose(payload: z.output<S>, job: Job, tx: Tx): Promise<Omit<EmailMessage, 'messageId'>>;
};

@Injectable()
export class EmailJobs {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    private readonly prisma: PrismaService,
    private readonly registry: JobRegistry,
  ) {}

  /** Registers an email job type (call from the owning module at start-up). */
  define<S extends z.ZodType>(definition: EmailJobDefinition<S>) {
    this.registry.register(
      defineJob({
        type: definition.type,
        payload: definition.payload,
        run: (payload, job) => this.deliver(job, (tx) => definition.compose(payload, job, tx)),
      }),
    );
  }

  private async deliver(job: Job, compose: (tx: Tx) => Promise<Omit<EmailMessage, 'messageId'>>) {
    // Unique per attempt: a resend after a crash carries a newly minted link, so providers that drop duplicate
    // Message-IDs must not keep the earlier copy, whose link is revoked (security review 2.3c).
    const messageId = `<job-${job.id}.${job.attempts}@${this.messageDomain()}>`;
    const message = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.emailDelivery.findUnique({ where: { jobId: job.id } });
      if (existing?.status === 'sent') return null;
      if (existing) {
        await tx.emailDelivery.update({
          where: { jobId: job.id },
          data: { attempts: { increment: 1 }, messageId },
        });
      } else {
        await tx.emailDelivery.create({
          data: { jobId: job.id, messageId, provider: this.provider.name },
        });
      }
      return compose(tx);
    });
    if (!message) return;

    try {
      await this.provider.send({ ...message, messageId });
    } catch (err) {
      // SMTP 5xx (recipient or message refused) will not improve with retries — and each retry would mint a new
      // token (D-081). Fail now; 4xx and connection errors are retried.
      const code = (err as { responseCode?: unknown }).responseCode;
      if (typeof code === 'number' && code >= 500) {
        throw new PermanentJobError(`SMTP rejected the message (${code})`);
      }
      throw err;
    }

    await this.prisma.emailDelivery.update({
      where: { jobId: job.id },
      data: { status: 'sent', sentAt: new Date() },
    });
  }

  private messageDomain() {
    const match = /@([A-Za-z0-9.-]+)>?\s*$/.exec(this.config.email.from);
    return match?.[1] ?? 'vachelearn.invalid';
  }
}
