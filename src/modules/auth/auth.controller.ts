import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AccessToken, Public } from '../../common/decorators/auth.decorators.js';
import { AuthService } from './auth.service.js';
import {
  AuthSessionDto,
  CodeSentDto,
  ContactDto,
  LoginDto,
  OkDto,
  RefreshDto,
  ResetPasswordDto,
  SignupDto,
  SignupResultDto,
  VerifyCodeDto,
} from './dto/auth.dto.js';

const MINUTE = 60_000;
/** Requests per minute from one IP, per route. */
const PerMinute = (limit: number) => Throttle({ default: { limit, ttl: MINUTE } });

/**
 * Mobile app sign-in. The app never talks to Supabase: it calls these and
 * keeps the returned tokens in secure storage.
 */
@ApiTags('Auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('signup')
  @HttpCode(HttpStatus.OK)
  @PerMinute(5)
  @ApiOperation({
    summary: 'Create an account and send a 6-digit code',
    description: 'Errors: ACCOUNT_EXISTS, WEAK_PASSWORD, SIGNUP_DISABLED, TOO_MANY_REQUESTS.',
  })
  @ApiOkResponse({ type: SignupResultDto })
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Public()
  @Post('signup/resend')
  @HttpCode(HttpStatus.OK)
  @PerMinute(3)
  @ApiOperation({ summary: 'Send the sign-up code again' })
  @ApiOkResponse({ type: CodeSentDto })
  resendSignupCode(@Body() dto: ContactDto) {
    return this.auth.resendSignupCode(dto);
  }

  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @PerMinute(10)
  @ApiOperation({
    summary: 'Check a sign-up or one-time login code and sign in',
    description: 'Errors: INVALID_CODE, ACCOUNT_SUSPENDED.',
  })
  @ApiOkResponse({ type: AuthSessionDto })
  verify(@Body() dto: VerifyCodeDto) {
    return this.auth.verify(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @PerMinute(10)
  @ApiOperation({
    summary: 'Log in with email or mobile number and password',
    description:
      'Errors: INVALID_CREDENTIALS, VERIFICATION_REQUIRED (a new code was sent; show the code step), ACCOUNT_SUSPENDED.',
  })
  @ApiOkResponse({ type: AuthSessionDto })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('login/code')
  @HttpCode(HttpStatus.OK)
  @PerMinute(3)
  @ApiOperation({
    summary: 'Send a one-time login code',
    description: 'Same answer whether or not the account exists. Then call /v1/auth/verify.',
  })
  @ApiOkResponse({ type: CodeSentDto })
  sendLoginCode(@Body() dto: ContactDto) {
    return this.auth.sendLoginCode(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @PerMinute(30)
  @ApiOperation({ summary: 'Trade a refresh token for new tokens', description: 'Errors: SESSION_EXPIRED.' })
  @ApiOkResponse({ type: AuthSessionDto })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End this session' })
  @ApiOkResponse({ type: OkDto })
  logout(@AccessToken() token: string) {
    return this.auth.logout(token);
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @PerMinute(3)
  @ApiOperation({
    summary: 'Send a password reset code',
    description: 'Same answer whether or not the account exists.',
  })
  @ApiOkResponse({ type: CodeSentDto })
  forgotPassword(@Body() dto: ContactDto) {
    return this.auth.forgotPassword(dto);
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @PerMinute(10)
  @ApiOperation({
    summary: 'Set a new password with the reset code and sign in',
    description: 'Errors: INVALID_CODE, WEAK_PASSWORD, SAME_PASSWORD.',
  })
  @ApiOkResponse({ type: AuthSessionDto })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }
}
