import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { DestinationStream } from 'pino';
import { AccessGuard } from './access/access.guard';
import { CONTEXT_RESOLVER, NoSessionResolver } from './access/request-context';
import { AuditService } from './audit/audit.service';
import { CURSORS, Cursors } from './common/pagination/keyset';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { APP_CONFIG, type AppConfig } from './config/env';
import { HealthController } from './health/health.controller';
import { loggingModule } from './logging/logging.module';
import { PrismaService } from './prisma/prisma.service';
import { BranchesController } from './tenancy/branches.controller';
import { BranchesService } from './tenancy/branches.service';
import { PlatformTenantsController } from './tenancy/platform-tenants.controller';
import { TenantsService } from './tenancy/tenants.service';

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
      controllers: [HealthController, PlatformTenantsController, BranchesController],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        // Who is calling: nobody until sessions arrive (Slice 2.3). Tests replace this with `overrideProvider`.
        { provide: CONTEXT_RESOLVER, useClass: NoSessionResolver },
        { provide: CURSORS, useValue: new Cursors(config.cursorSecret) },
        PrismaService,
        AuditService,
        TenantsService,
        BranchesService,
        // Deny by default: every route must be @Public() or name its permission.
        { provide: APP_GUARD, useClass: AccessGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
      exports: [APP_CONFIG, PrismaService, AuditService],
    };
  }
}
