import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AuthSessionView,
  ForgotPasswordBody,
  LoginBody,
  SetPasswordBody,
} from '@vachelearn/contracts';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { Authenticated, Public } from '../access/access.guard';
import { Ctx, type RequestContext } from '../access/request-context';
import { ApiZodBody, ApiZodResponse } from '../common/openapi/zod-openapi';
import { requestIdOf } from '../common/request-id';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { AuthService } from './auth.service';
import { PasswordLinksService } from './password-links.service';
import { SESSION_COOKIE, sessionCookieOptions, sessionTokenFrom } from './session-tokens';

/** Sign-in, sign-out and the caller's own session (D-010). Thin: rules live in AuthService. */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordLinks: PasswordLinksService,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @ApiZodBody(LoginBody)
  @ApiZodResponse(200, AuthSessionView)
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(LoginBody)) body: z.output<typeof LoginBody>,
  ): Promise<AuthSessionView> {
    // `req.ip` honours exactly TRUST_PROXY_HOPS proxies (bootstrap.ts), never more.
    const { token, expiresAt, view } = await this.auth.login(
      body,
      req.ip ?? 'unknown',
      requestIdOf(req),
      sessionTokenFrom(req),
    );
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return view;
  }

  @Get('me')
  @Authenticated()
  @ApiZodResponse(200, AuthSessionView)
  me(@Ctx() ctx: RequestContext) {
    return this.auth.me(ctx);
  }

  @Post('logout')
  @Authenticated()
  @HttpCode(204)
  async logout(@Ctx() ctx: RequestContext, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(ctx);
    res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(new Date(0)), expires: undefined });
  }

  /** Always 202, whether or not the address has an account (D-087). */
  @Post('password/forgot')
  @Public()
  @HttpCode(202)
  @ApiZodBody(ForgotPasswordBody)
  async forgotPassword(
    @Req() req: Request,
    @Body(new ZodValidationPipe(ForgotPasswordBody)) body: z.output<typeof ForgotPasswordBody>,
  ) {
    await this.passwordLinks.requestForgot(body, req.ip ?? 'unknown');
  }

  /** Consumes a set-password or reset link. The caller then signs in; every older session has ended. */
  @Post('password/set')
  @Public()
  @HttpCode(204)
  @ApiZodBody(SetPasswordBody)
  async setPassword(
    @Req() req: Request,
    @Body(new ZodValidationPipe(SetPasswordBody)) body: z.output<typeof SetPasswordBody>,
  ) {
    await this.passwordLinks.setPassword(body, req.ip ?? 'unknown', requestIdOf(req));
  }
}
