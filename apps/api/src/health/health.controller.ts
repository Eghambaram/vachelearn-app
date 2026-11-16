import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthResponse, ReadyResponse } from '@vachelearn/contracts';
import { Public } from '../access/access.guard';
import { ApiException } from '../common/errors/api-exception';
import { ApiZodResponse } from '../common/openapi/zod-openapi';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/** Liveness and readiness probes, outside the /api/v1 prefix (deployment platforms call them directly). */
@ApiTags('health')
@Public()
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get('health')
  @ApiZodResponse(200, HealthResponse, 'The process is up')
  health(): HealthResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiZodResponse(200, ReadyResponse, 'The database and object storage answer')
  async ready(): Promise<ReadyResponse> {
    const [database, storage] = await Promise.all([this.prisma.isReady(), this.storage.isReady()]);
    if (!database || !storage) {
      throw new ApiException(503, 'NOT_READY', 'Service not ready');
    }
    return { status: 'ready', checks: { database: 'up', storage: 'up' } };
  }
}
