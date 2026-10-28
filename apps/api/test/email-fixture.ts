import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { z } from 'zod';
import { EmailJobs } from '../src/email/email-jobs';

const payload = z.object({ subjectTag: z.string(), token: z.never().optional() }).strict();

/** Stand-in for the 2.3 verification email: the link's token exists only inside `compose` (D-081). */
export function defineNotice(app: INestApplication, minted: string[]) {
  app.get(EmailJobs).define({
    type: 'email.test_notice',
    payload,
    compose: async ({ subjectTag }) => {
      const token = `tok_${randomUUID().replaceAll('-', '')}`;
      minted.push(token);
      return {
        to: 'learner@example.test',
        subject: `Verify your address (Demo) ${subjectTag}`,
        text: `Open https://app.example.test/verify?token=${token} to continue.`,
      };
    },
  });
}
