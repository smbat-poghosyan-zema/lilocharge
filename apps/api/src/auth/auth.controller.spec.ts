import type { AuthTokenPairResponse, PhoneOtpRequestResponse } from '@lilocharge/shared-types';

import type { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import type { EmailLoginDto } from './dto/email-login.dto';
import type { RefreshTokenDto } from './dto/refresh-token.dto';
import type { RequestPhoneOtpDto } from './dto/request-phone-otp.dto';
import type { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';

interface AuthServiceMock {
  readonly login: jest.Mock<Promise<AuthTokenPairResponse>, [EmailLoginDto]>;
  readonly refreshTokens: jest.Mock<Promise<AuthTokenPairResponse>, [RefreshTokenDto]>;
  readonly requestPhoneOtp: jest.Mock<Promise<PhoneOtpRequestResponse>, [RequestPhoneOtpDto]>;
  readonly verifyPhoneOtpAndRegister: jest.Mock<
    Promise<AuthTokenPairResponse>,
    [VerifyPhoneOtpDto]
  >;
}

describe('AuthController', () => {
  it('delegates all endpoints to auth service methods', async () => {
    const authServiceMock: AuthServiceMock = {
      login: jest.fn<Promise<AuthTokenPairResponse>, [EmailLoginDto]>().mockResolvedValue({
        accessToken: 'access-login',
        refreshToken: 'refresh-login',
        tokenType: 'Bearer',
      }),
      refreshTokens: jest
        .fn<Promise<AuthTokenPairResponse>, [RefreshTokenDto]>()
        .mockResolvedValue({
          accessToken: 'access-refresh',
          refreshToken: 'refresh-refresh',
          tokenType: 'Bearer',
        }),
      requestPhoneOtp: jest
        .fn<Promise<PhoneOtpRequestResponse>, [RequestPhoneOtpDto]>()
        .mockResolvedValue({
          expiresInSeconds: 300,
          message: 'OTP sent successfully',
        }),
      verifyPhoneOtpAndRegister: jest
        .fn<Promise<AuthTokenPairResponse>, [VerifyPhoneOtpDto]>()
        .mockResolvedValue({
          accessToken: 'access-register',
          refreshToken: 'refresh-register',
          tokenType: 'Bearer',
        }),
    };

    const controller = new AuthController(authServiceMock as unknown as AuthService);

    const otpPayload: RequestPhoneOtpDto = { phone: '+37477123456' };
    const verifyPayload: VerifyPhoneOtpDto = {
      code: '123456',
      displayName: 'Անի Սարգսյան',
      email: 'ani@example.com',
      language: 'hy',
      password: 'Password123!',
      phone: '+37477123456',
    };
    const loginPayload: EmailLoginDto = {
      email: 'ani@example.com',
      password: 'Password123!',
    };
    const refreshPayload: RefreshTokenDto = {
      refreshToken: 'refresh-login',
    };

    await expect(controller.requestPhoneOtp(otpPayload)).resolves.toEqual({
      expiresInSeconds: 300,
      message: 'OTP sent successfully',
    });
    await expect(controller.verifyPhoneOtpAndRegister(verifyPayload)).resolves.toEqual({
      accessToken: 'access-register',
      refreshToken: 'refresh-register',
      tokenType: 'Bearer',
    });
    await expect(controller.login(loginPayload)).resolves.toEqual({
      accessToken: 'access-login',
      refreshToken: 'refresh-login',
      tokenType: 'Bearer',
    });
    await expect(controller.refreshTokens(refreshPayload)).resolves.toEqual({
      accessToken: 'access-refresh',
      refreshToken: 'refresh-refresh',
      tokenType: 'Bearer',
    });

    expect(authServiceMock.requestPhoneOtp).toHaveBeenCalledWith(otpPayload);
    expect(authServiceMock.verifyPhoneOtpAndRegister).toHaveBeenCalledWith(verifyPayload);
    expect(authServiceMock.login).toHaveBeenCalledWith(loginPayload);
    expect(authServiceMock.refreshTokens).toHaveBeenCalledWith(refreshPayload);
  });
});
