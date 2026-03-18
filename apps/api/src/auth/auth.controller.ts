import type { AuthTokenPairResponse, PhoneOtpRequestResponse } from '@lilocharge/shared-types';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { Public } from './decorators/public.decorator';
import { AuthService } from './auth.service';
import { EmailLoginDto } from './dto/email-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestPhoneOtpDto } from './dto/request-phone-otp.dto';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';

/** Controller exposing authentication endpoints for registration and login. */
@ApiTags('auth')
@Controller('auth')
@Public()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Requests a phone OTP code for registration verification. */
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 300000, limit: 5 } })
  public async requestPhoneOtp(@Body() dto: RequestPhoneOtpDto): Promise<PhoneOtpRequestResponse> {
    return this.authService.requestPhoneOtp(dto);
  }

  /** Verifies phone OTP and completes user registration. */
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 300000, limit: 10 } })
  public async verifyPhoneOtpAndRegister(
    @Body() dto: VerifyPhoneOtpDto,
  ): Promise<AuthTokenPairResponse> {
    return this.authService.verifyPhoneOtpAndRegister(dto);
  }

  /** Logs in an existing user with email/password credentials. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  public async login(@Body() dto: EmailLoginDto): Promise<AuthTokenPairResponse> {
    return this.authService.login(dto);
  }

  /** Rotates access and refresh tokens using a valid refresh JWT. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  public async refreshTokens(@Body() dto: RefreshTokenDto): Promise<AuthTokenPairResponse> {
    return this.authService.refreshTokens(dto);
  }
}
