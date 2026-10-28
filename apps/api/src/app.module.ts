import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { AccessGuard } from './access/access.guard';
import { CONTEXT_RESOLVER } from './access/request-context';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { PasswordLinksService } from './auth/password-links.service';
import { RateLimitService } from './auth/rate-limit.service';
import { SessionResolver } from './auth/session.resolver';
import { SessionsService } from './auth/sessions.service';
import { AuditService } from './audit/audit.service';
import { CURSORS, Cursors } from './common/pagination/keyset';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { APP_CONFIG, type AppConfig } from './config/env';
import { EMAIL_PROVIDER, EmailJobs } from './email/email-jobs';
import { createEmailProvider } from './email/email.provider';
import { HealthController } from './health/health.controller';
import { JobRegistry } from './jobs/job-handlers';
import { JobWorker } from './jobs/job-worker';
import { JobsService } from './jobs/jobs.service';
import { loggingModule } from './logging/logging.module';
import { PrismaService } from './prisma/prisma.service';
import { BranchesController } from './tenancy/branches.controller';
import { BranchesService } from './tenancy/branches.service';
import { PlatformTenantsController } from './tenancy/platform-tenants.controller';
import { TenantsService } from './tenancy/tenants.service';
import { UsersService } from './users/users.service';

export type AppModuleOptions = {
  /** Where logs go (tests capture them); stdout when omitted. */
  logStream?: DestinationStream;
};

/**
 * Root module. Configuration is validated before this runs and injected as `APP_CONFIG`. Bounded-context modules
 * (tenancy, auth, people, access…) are added here slice by slice (Phase 2+).
 */
@Module({})
export class AppModule {
  static forRoot(config: AppConfig, options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [loggingModule(config, options.logStream)],
      controllers: [
        HealthController,
        AuthController,
        PlatformTenantsController,
        BranchesController,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        // Who is calling: the session cookie (D-010). Tests replace this with `overrideProvider`.
        SessionsService,
        { provide: CONTEXT_RESOLVER, useClass: SessionResolver },
        RateLimitService,
        AuthService,
        PasswordLinksService,
        UsersService,
        { provide: CURSORS, useValue: new Cursors(config.cursorSecret) },
        PrismaService,
        AuditService,
        TenantsService,
        BranchesService,
        // Background jobs and email (D-040, D-081).
        { provide: JobRegistry, useValue: new JobRegistry() },
        JobsService,
        JobWorker,
        {
          provide: EMAIL_PROVIDER,
          inject: [PinoLogger],
          useFactory: (logger: PinoLogger) => createEmailProvider(config, logger),
        },
        EmailJobs,
        // Deny by default: every route must be @Public() or name its permission.
        { provide: APP_GUARD, useClass: AccessGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
      exports: [APP_CONFIG, PrismaService, AuditService, JobsService, EmailJobs, UsersService],
    };
  }
}
