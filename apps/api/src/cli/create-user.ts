import { hostname, userInfo } from 'node:os';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ApiException } from '../common/errors/api-exception';
import { loadConfig } from '../config/env';
import { PASSWORD_LINK_JOB } from '../auth/password-links.service';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

/*
 * Operator command (D-083): creates an account without a password and sends its set-password email, which is the only
 * way in — no password is ever typed here, stored in a script or printed. Platform roles arrive in Slice 2.4.
 *
 *   pnpm --filter api user:create --email someone@example.com --name "Someone" --reason "First platform admin"
 *
 * The email is sent before the command exits (through the configured provider: Mailpit locally); if sending fails the
 * job stays queued and the API's job worker retries it.
 */

async function main() {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, name: { type: 'string' }, reason: { type: 'string' } },
    strict: true,
  });
  if (!values.email || !values.name || !values.reason || values.reason.trim().length < 3) {
    console.error('Usage: user:create --email <address> --name "<display name>" --reason "<why>"');
    process.exitCode = 2;
    return;
  }
  // This process sends the one email itself; the API's worker handles everything else.
  const config = loadConfig({ ...process.env, JOBS_WORKER: 'false', LOG_LEVEL: 'warn' });
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), {
    logger: ['error', 'warn'],
  });
  try {
    const user = await app.get(UsersService).createWithSetupLink(
      { email: values.email, displayName: values.name },
      {
        userId: null,
        requestId: null,
        // Who ran it, from where, and why: the only attribution an operator command has (no session).
        reason:
          `user:create by ${userInfo().username}@${hostname()}: ${values.reason.trim()}`.slice(
            0,
            500,
          ),
      },
    );
    // Send this account's email only; anything else queued is the API worker's job.
    const job = await app.get(PrismaService).job.findFirstOrThrow({
      where: { type: PASSWORD_LINK_JOB, payload: { path: ['userId'], equals: user.id } },
      select: { id: true },
    });
    await app.get(JobsService).runJob(`cli:${process.pid}`, job.id);
    const sent = await app.get(PrismaService).job.findUniqueOrThrow({
      where: { id: job.id },
      select: { status: true },
    });
    console.log(`Created user ${user.id} (${user.email}).`);
    console.log(
      sent.status === 'succeeded'
        ? 'A set-password email was sent; the link lasts 7 days.'
        : 'The set-password email is not sent yet: the API job worker will retry it (check the jobs table).',
    );
  } catch (err) {
    if (err instanceof ApiException) {
      console.error(
        err.fieldErrors?.map((f) => `${f.field}: ${f.message}`).join('\n') ?? err.message,
      );
      process.exitCode = 1;
      return;
    }
    if (err instanceof Error && err.name === 'ZodError') {
      console.error(
        'Invalid input: a valid email and a display name of 1–120 characters are required.',
      );
      process.exitCode = 1;
      return;
    }
    throw err;
  } finally {
    await app.close();
  }
}

void main();
