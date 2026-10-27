import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthResponse, ReadyResponse } from '@vachelearn/contracts';
import { ApiException } from '../common/errors/api-exception';
import { ApiZodResponse } from '../common/openapi/zod-openapi';
import { PrismaService } from '../prisma/prisma.service';

/** Liveness and readiness probes, outside the /api/v1 prefix (deployment platforms call them directly). */
@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  @ApiZodResponse(200, HealthResponse, 'The process is up')
  health(): HealthResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiZodResponse(200, ReadyResponse, 'The database answers')
  async ready(): Promise<ReadyResponse> {
    if (!(await this.prisma.isReady())) {
      throw new ApiException(503, 'NOT_READY', 'Service not ready');
    }
    return { status: 'ready', checks: { database: 'up' } };
  }
}
