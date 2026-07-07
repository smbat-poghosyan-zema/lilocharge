import type { SupportedLanguageCode } from '@lilocharge/shared-types';
import type { Language } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { hash } from 'bcrypt';

import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { SmsService } from '../sms/sms.service';
import { AuthService } from './auth.service';

interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly phone: string | null;
  readonly displayName: string;
  readonly language: Language;
}

interface PrismaUserDelegateMock {
  readonly create: jest.Mock<Promise<UserRecord>, [unknown]>;
  readonly findFirst: jest.Mock<Promise<UserRecord | null>, [unknown]>;
  readonly findUnique: jest.Mock<Promise<UserRecord | null>, [unknown]>;
}

interface PrismaServiceMock {
  readonly user: PrismaUserDelegateMock;
}

interface RedisServiceMock {
  readonly del: jest.Mock<Promise<void>, [string]>;
  readonly get: jest.Mock<Promise<string | null>, [string]>;
  readonly setEx: jest.Mock<Promise<void>, [string, number, string]>;
}

interface JwtServiceMock {
  readonly signAsync: jest.Mock<
    Promise<string>,
    [Record<string, unknown>, Record<string, unknown>?]
  >;
  readonly verifyAsync: jest.Mock<
    Promise<Record<string, unknown>>,
    [string, Record<string, unknown>?]
  >;
}

interface SmsServiceMock {
  readonly sendSms: jest.Mock<
    ReturnType<SmsService['sendSms']>,
    Parameters<SmsService['sendSms']>
  >;
}

const USER_ID = '11111111-1111-1111-1111-111111111111';
const USER_EMAIL = 'ani@example.com';
const USER_PHONE = '+37477123456';
const USER_NAME = 'Անի Սարգսյան';
const USER_LANGUAGE: SupportedLanguageCode = 'hy';
const USER_LANGUAGE_DB: Language = 'HY';

/**
 * Builds a complete user record fixture with configurable password hash.
 */
function buildUser(passwordHash: string): UserRecord {
  return {
    id: USER_ID,
    email: USER_EMAIL,
    passwordHash,
    phone: USER_PHONE,
    displayName: USER_NAME,
    language: USER_LANGUAGE_DB,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let prismaMock: PrismaServiceMock;
  let redisMock: RedisServiceMock;
  let jwtMock: JwtServiceMock;
  let smsMock: SmsServiceMock;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';
    process.env.JWT_EXPIRY = '1h';
    process.env.REFRESH_TOKEN_EXPIRY = '7d';
    process.env.AUTH_OTP_TTL_SECONDS = '180';
    process.env.AUTH_REFRESH_SESSION_TTL_SECONDS = '1200';

    prismaMock = {
      user: {
        create: jest.fn<Promise<UserRecord>, [unknown]>(),
        findFirst: jest.fn<Promise<UserRecord | null>, [unknown]>().mockResolvedValue(null),
        findUnique: jest.fn<Promise<UserRecord | null>, [unknown]>().mockResolvedValue(null),
      },
    };
    redisMock = {
      del: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
      get: jest.fn<Promise<string | null>, [string]>(),
      setEx: jest.fn<Promise<void>, [string, number, string]>().mockResolvedValue(undefined),
    };
    jwtMock = {
      signAsync: jest
        .fn<Promise<string>, [Record<string, unknown>, Record<string, unknown>?]>()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token'),
      verifyAsync: jest.fn<Promise<Record<string, unknown>>, [string, Record<string, unknown>?]>(),
    };
    smsMock = {
      sendSms: jest
        .fn<ReturnType<SmsService['sendSms']>, Parameters<SmsService['sendSms']>>()
        .mockResolvedValue(undefined),
    };

    service = new AuthService(
      prismaMock as unknown as PrismaService,
      redisMock as unknown as RedisService,
      jwtMock as unknown as JwtService,
      smsMock as unknown as SmsService,
    );
  });

  it('stores phone OTP in Redis with configured TTL', async () => {
    const response = await service.requestPhoneOtp({ phone: USER_PHONE });

    expect(response.expiresInSeconds).toBe(180);
    expect(redisMock.setEx).toHaveBeenCalledTimes(1);

    const [[key, ttlSeconds, otpCode]] = redisMock.setEx.mock.calls;
    expect(key).toBe(`auth:otp:${USER_PHONE}`);
    expect(ttlSeconds).toBe(180);
    expect(/^\d{6}$/.test(otpCode)).toBe(true);
  });

  it('delivers the stored OTP code to the requested phone via SMS in Armenian by default', async () => {
    await service.requestPhoneOtp({ phone: USER_PHONE });

    const [[, , otpCode]] = redisMock.setEx.mock.calls;
    expect(smsMock.sendSms).toHaveBeenCalledTimes(1);

    const [[smsInput]] = smsMock.sendSms.mock.calls;
    expect(smsInput.to).toBe(USER_PHONE);
    expect(smsInput.body).toContain(otpCode);
    expect(smsInput.body).toContain('LiloCharge');
    expect(smsInput.body).toContain('3 րոպե');
  });

  it('renders the OTP SMS in Russian with the correct minute plural when requested', async () => {
    await service.requestPhoneOtp({ language: 'ru', phone: USER_PHONE });

    const [[smsInput]] = smsMock.sendSms.mock.calls;
    expect(smsInput.body).toContain('код подтверждения');
    expect(smsInput.body).toContain('3 минуты');
  });

  it('renders the OTP SMS in English when requested', async () => {
    await service.requestPhoneOtp({ language: 'en', phone: USER_PHONE });

    const [[smsInput]] = smsMock.sendSms.mock.calls;
    expect(smsInput.body).toContain('verification code');
    expect(smsInput.body).toContain('3 minutes');
  });

  it('propagates SMS delivery failures instead of claiming the OTP was sent', async () => {
    smsMock.sendSms.mockRejectedValue(new ServiceUnavailableException('SMS delivery failed'));

    await expect(service.requestPhoneOtp({ phone: USER_PHONE })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(redisMock.setEx).toHaveBeenCalledTimes(1);
  });

  it('verifies OTP, creates a user, and returns access/refresh tokens', async () => {
    redisMock.get.mockResolvedValue('123456');
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockImplementation(() => Promise.resolve(buildUser('hashed')));

    const response = await service.verifyPhoneOtpAndRegister({
      code: '123456',
      displayName: USER_NAME,
      email: USER_EMAIL,
      language: USER_LANGUAGE,
      password: 'Password123!',
      phone: USER_PHONE,
    });

    expect(response).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
    });
    expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
    expect(redisMock.del).toHaveBeenCalledWith(`auth:otp:${USER_PHONE}`);
    expect(redisMock.setEx).toHaveBeenCalledWith(
      `auth:refresh:${USER_ID}`,
      1200,
      expect.any(String),
    );
  });

  it('rejects registration when OTP code does not match', async () => {
    redisMock.get.mockResolvedValue('654321');

    await expect(
      service.verifyPhoneOtpAndRegister({
        code: '111111',
        displayName: USER_NAME,
        email: USER_EMAIL,
        language: USER_LANGUAGE,
        password: 'Password123!',
        phone: USER_PHONE,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logs in with email/password and returns fresh tokens', async () => {
    const passwordHash = await hash('Password123!', 12);
    const user = buildUser(passwordHash);

    prismaMock.user.findUnique.mockResolvedValue(user);
    jwtMock.signAsync.mockReset();
    jwtMock.signAsync.mockResolvedValueOnce('access-login').mockResolvedValueOnce('refresh-login');

    const response = await service.login({
      email: user.email,
      password: 'Password123!',
    });

    expect(response.accessToken).toBe('access-login');
    expect(response.refreshToken).toBe('refresh-login');
    expect(redisMock.setEx).toHaveBeenCalledWith(
      `auth:refresh:${USER_ID}`,
      1200,
      expect.any(String),
    );
  });

  it('rejects login when password is invalid', async () => {
    const passwordHash = await hash('Password123!', 12);
    prismaMock.user.findUnique.mockResolvedValue(buildUser(passwordHash));

    await expect(
      service.login({
        email: USER_EMAIL,
        password: 'WrongPassword123!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refreshes tokens when refresh token payload and Redis jti are valid', async () => {
    const passwordHash = await hash('Password123!', 12);
    prismaMock.user.findUnique.mockResolvedValue(buildUser(passwordHash));
    redisMock.get.mockResolvedValue('refresh-jti-1');
    jwtMock.verifyAsync.mockResolvedValue({
      jti: 'refresh-jti-1',
      sub: USER_ID,
      tokenType: 'refresh',
    });
    jwtMock.signAsync.mockReset();
    jwtMock.signAsync
      .mockResolvedValueOnce('access-refresh')
      .mockResolvedValueOnce('refresh-refresh');

    const response = await service.refreshTokens({
      refreshToken: 'valid-refresh-token',
    });

    expect(response.accessToken).toBe('access-refresh');
    expect(response.refreshToken).toBe('refresh-refresh');
    expect(redisMock.get).toHaveBeenCalledWith(`auth:refresh:${USER_ID}`);
  });

  it('rejects refresh when token jti does not match Redis session', async () => {
    redisMock.get.mockResolvedValue('refresh-jti-2');
    jwtMock.verifyAsync.mockResolvedValue({
      jti: 'refresh-jti-1',
      sub: USER_ID,
      tokenType: 'refresh',
    });

    await expect(
      service.refreshTokens({
        refreshToken: 'stale-token',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
