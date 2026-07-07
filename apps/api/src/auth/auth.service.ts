import type {
  AuthTokenPairResponse,
  PhoneOtpRequestResponse,
  SupportedLanguageCode,
} from '@lilocharge/shared-types';
import { Language, Prisma, type User } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { randomInt, randomUUID } from 'node:crypto';

import { parsePositiveIntegerOrDefault } from '../common/parse-positive-integer';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SmsService } from '../sms/sms.service';
import { EmailLoginDto } from './dto/email-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestPhoneOtpDto } from './dto/request-phone-otp.dto';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';

const BCRYPT_ROUNDS = 12;
const DEFAULT_ACCESS_TOKEN_EXPIRY = '1h';
const DEFAULT_OTP_TTL_SECONDS = 300;
const DEFAULT_REFRESH_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const DEFAULT_REFRESH_TOKEN_EXPIRY = '7d';
const OTP_LENGTH = 6;

interface AccessTokenPayload {
  readonly sub: string;
  readonly email: string;
  readonly tokenType: 'access';
}

interface RefreshTokenPayload {
  readonly sub: string;
  readonly jti: string;
  readonly tokenType: 'refresh';
}

/** Service implementing OTP registration, login, and JWT refresh flows. */
@Injectable()
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly smsService: SmsService,
  ) {}

  /** Requests a phone OTP code, stores it in Redis with an expiry, and delivers it via SMS. */
  public async requestPhoneOtp(dto: RequestPhoneOtpDto): Promise<PhoneOtpRequestResponse> {
    const normalizedPhone = normalizePhone(dto.phone);
    const existingUser = await this.prismaService.user.findUnique({
      where: { phone: normalizedPhone },
    });
    if (existingUser !== null) {
      throw new ConflictException('Phone number is already registered');
    }

    const otpTtlSeconds = resolveOtpTtlSeconds();
    const otpCode = generateOtpCode();

    await this.redisService.setEx(buildOtpKey(normalizedPhone), otpTtlSeconds, otpCode);

    // Delivery failures propagate as errors so the API never claims an OTP was sent when it
    // was not. In disabled mode (SMS_ENABLED unset) SmsService no-ops and dev flows keep
    // reading the OTP from Redis.
    await this.smsService.sendSms({
      body: buildOtpSmsBody(otpCode, otpTtlSeconds, dto.language ?? 'hy'),
      to: normalizedPhone,
    });

    return {
      message: 'OTP sent successfully',
      expiresInSeconds: otpTtlSeconds,
    };
  }

  /** Verifies OTP code, creates the user account, and returns JWT tokens. */
  public async verifyPhoneOtpAndRegister(dto: VerifyPhoneOtpDto): Promise<AuthTokenPairResponse> {
    const normalizedPhone = normalizePhone(dto.phone);
    const normalizedEmail = normalizeEmail(dto.email);
    const otpKey = buildOtpKey(normalizedPhone);
    const storedOtp = await this.redisService.get(otpKey);

    if (storedOtp === null) {
      throw new BadRequestException('OTP expired or not found');
    }

    if (storedOtp !== dto.code) {
      throw new UnauthorizedException('Invalid OTP code');
    }

    const conflictingUser = await this.prismaService.user.findFirst({
      where: {
        OR: [{ email: normalizedEmail }, { phone: normalizedPhone }],
      },
    });
    if (conflictingUser !== null) {
      throw new ConflictException('User with provided email or phone already exists');
    }

    const passwordHash = await hash(dto.password, BCRYPT_ROUNDS);
    const language = mapLanguageCodeToPrismaEnum(dto.language);

    try {
      const createdUser = await this.prismaService.user.create({
        data: {
          displayName: dto.displayName.trim(),
          email: normalizedEmail,
          language,
          passwordHash,
          phone: normalizedPhone,
        },
      });

      await this.redisService.del(otpKey);
      return this.issueTokenPair(createdUser);
    } catch (error: unknown) {
      if (isPrismaUniqueConstraintError(error)) {
        throw new ConflictException('User with provided email or phone already exists');
      }
      throw error;
    }
  }

  /** Authenticates an existing user via email/password and returns JWT tokens. */
  public async login(dto: EmailLoginDto): Promise<AuthTokenPairResponse> {
    const normalizedEmail = normalizeEmail(dto.email);
    const user = await this.prismaService.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user === null) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueTokenPair(user);
  }

  /** Validates a refresh token and rotates both access/refresh JWTs. */
  public async refreshTokens(dto: RefreshTokenDto): Promise<AuthTokenPairResponse> {
    const payload = await this.verifyRefreshToken(dto.refreshToken);
    const refreshSessionKey = buildRefreshSessionKey(payload.sub);
    const storedJti = await this.redisService.get(refreshSessionKey);

    if (storedJti === null || storedJti !== payload.jti) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prismaService.user.findUnique({
      where: { id: payload.sub },
    });
    if (user === null) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokenPair(user);
  }

  /** Signs and persists a new token pair for the provided user identity. */
  private async issueTokenPair(user: Pick<User, 'email' | 'id'>): Promise<AuthTokenPairResponse> {
    const refreshTokenJti = randomUUID();
    const accessTokenPayload: AccessTokenPayload = {
      email: user.email,
      sub: user.id,
      tokenType: 'access',
    };
    const refreshTokenPayload: RefreshTokenPayload = {
      jti: refreshTokenJti,
      sub: user.id,
      tokenType: 'refresh',
    };

    const accessTokenSecret = resolveRequiredEnv('JWT_SECRET');
    const refreshTokenSecret = resolveRequiredEnv('REFRESH_TOKEN_SECRET');
    const accessTokenExpiry = process.env.JWT_EXPIRY ?? DEFAULT_ACCESS_TOKEN_EXPIRY;
    const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY ?? DEFAULT_REFRESH_TOKEN_EXPIRY;

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessTokenPayload, {
        expiresIn: accessTokenExpiry,
        secret: accessTokenSecret,
      }),
      this.jwtService.signAsync(refreshTokenPayload, {
        expiresIn: refreshTokenExpiry,
        secret: refreshTokenSecret,
      }),
    ]);

    await this.redisService.setEx(
      buildRefreshSessionKey(user.id),
      resolveRefreshSessionTtlSeconds(),
      refreshTokenJti,
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
    };
  }

  /** Verifies refresh JWT and normalizes validation failures to 401 responses. */
  private async verifyRefreshToken(refreshToken: string): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: resolveRequiredEnv('REFRESH_TOKEN_SECRET'),
      });

      if (!isRefreshTokenPayload(payload)) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return payload;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}

/** Maps shared API language codes into Prisma's persisted language enum values. */
function mapLanguageCodeToPrismaEnum(languageCode: SupportedLanguageCode | undefined): Language {
  switch (languageCode) {
    case 'ru':
      return Language.RU;
    case 'en':
      return Language.EN;
    case 'hy':
    default:
      return Language.HY;
  }
}

/** Resolves JWT secrets from environment and fails loudly when absent. */
function resolveRequiredEnv(envKey: string): string {
  const rawValue = process.env[envKey];
  if (rawValue === undefined || rawValue.trim().length === 0) {
    throw new InternalServerErrorException(`Missing required environment variable: ${envKey}`);
  }

  return rawValue.trim();
}

/** Parses OTP TTL (seconds) from environment with a safe positive integer fallback. */
function resolveOtpTtlSeconds(): number {
  return parsePositiveIntegerOrDefault(process.env.AUTH_OTP_TTL_SECONDS, DEFAULT_OTP_TTL_SECONDS);
}

/** Parses refresh-session TTL (seconds) from environment with a safe fallback. */
function resolveRefreshSessionTtlSeconds(): number {
  return parsePositiveIntegerOrDefault(
    process.env.AUTH_REFRESH_SESSION_TTL_SECONDS,
    DEFAULT_REFRESH_SESSION_TTL_SECONDS,
  );
}

/** Builds the Redis key used to cache OTPs by normalized phone number. */
function buildOtpKey(phone: string): string {
  return `auth:otp:${phone}`;
}

/**
 * Localized OTP SMS templates keyed by language. Armenian (hy) is the product default.
 *
 * The backend has no i18next runtime, so these are a small typed record of builders that keep
 * the OTP code interpolation and expiry-minutes wording correct in each language.
 */
const OTP_SMS_TEMPLATES: Record<
  SupportedLanguageCode,
  (otpCode: string, expiryMinutes: number) => string
> = {
  hy: (otpCode, expiryMinutes) =>
    `Ձեր LiloCharge հաստատման կոդն է՝ ${otpCode}: Կոդը վավեր է ${expiryMinutes} րոպե:`,
  ru: (otpCode, expiryMinutes) =>
    `Ваш код подтверждения LiloCharge: ${otpCode}. Он действителен ${expiryMinutes} ${resolveRussianMinutesWord(expiryMinutes)}.`,
  en: (otpCode, expiryMinutes) =>
    `Your LiloCharge verification code is ${otpCode}. It expires in ${expiryMinutes} minute${expiryMinutes === 1 ? '' : 's'}.`,
};

/** Selects the grammatically correct Russian plural form of "minute" for the given count. */
function resolveRussianMinutesWord(minutes: number): string {
  const modHundred = minutes % 100;
  const modTen = minutes % 10;

  if (modHundred >= 11 && modHundred <= 14) {
    return 'минут';
  }
  if (modTen === 1) {
    return 'минута';
  }
  if (modTen >= 2 && modTen <= 4) {
    return 'минуты';
  }

  return 'минут';
}

/** Builds the localized SMS text delivering one OTP code with its expiry window. */
function buildOtpSmsBody(
  otpCode: string,
  otpTtlSeconds: number,
  language: SupportedLanguageCode,
): string {
  const expiryMinutes = Math.max(1, Math.ceil(otpTtlSeconds / 60));

  return OTP_SMS_TEMPLATES[language](otpCode, expiryMinutes);
}

/** Builds the Redis key used to track active refresh-token session IDs by user. */
function buildRefreshSessionKey(userId: string): string {
  return `auth:refresh:${userId}`;
}

/** Normalizes email to lowercase, trimmed format for stable lookups. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Normalizes phone values by trimming whitespace while preserving E.164 format. */
function normalizePhone(phone: string): string {
  return phone.trim();
}

/** Generates a zero-padded numeric OTP code of fixed configured length. */
function generateOtpCode(): string {
  const maxExclusive = 10 ** OTP_LENGTH;
  const otpValue = randomInt(0, maxExclusive);

  return otpValue.toString().padStart(OTP_LENGTH, '0');
}

/** Type guard for Prisma unique-constraint errors. */
function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Type guard ensuring refresh payload contains expected fields and token type. */
function isRefreshTokenPayload(payload: unknown): payload is RefreshTokenPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.sub === 'string' &&
    typeof candidate.jti === 'string' &&
    candidate.tokenType === 'refresh'
  );
}
