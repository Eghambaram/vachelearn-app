import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MembershipList } from '@vachelearn/contracts';
import { Authenticated } from './access.guard';
import { MembershipsService } from './memberships.service';
import { Ctx, type RequestContext } from './request-context';
import { ApiZodResponse } from '../common/openapi/zod-openapi';

/** The caller's own account data (no tenant permission needed: only ever the caller's own rows). */
@ApiTags('me')
@Controller('me')
export class MeController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get('memberships')
  @Authenticated()
  @ApiZodResponse(200, MembershipList)
  async memberships(@Ctx() ctx: RequestContext): Promise<MembershipList> {
    return {
      data: await this.membershipsService.listOwn(
        ctx.userId,
        ctx.session?.activeMembershipId ?? null,
      ),
    };
  }
}
