import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { AuthTokenPairResponse } from '@lilocharge/shared-types';
import { ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';

import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/** Access token JWT payload structure. */
interface AccessTokenPayload {
  readonly sub: string;
  readonly email: string;
  readonly tokenType: 'access';
}

/** Refresh token JWT payload structure. */
interface RefreshTokenPayload {
  readonly sub: string;
  readonly jti: string;
  readonly tokenType: 'refresh';
}

/**
 * E2E test suite for user registration flow via phone OTP.
 * Tests the complete flow: request OTP → verify code → check user created → validate tokens.
 */
describe('AuthController (E2E) - User Registration Flow', () => {
  let app: NestFastifyApplication;
  let prismaService: PrismaService;
  let redisService: RedisService;
  let jwtService: JwtService;

  const TEST_PHONE = '+37477999888';
  const TEST_EMAIL = 'ani.test@example.com';
  const TEST_DISPLAY_NAME = 'Անի Թեստ';
  const TEST_PASSWORD = 'SecurePassword123!';
  const TEST_LANGUAGE = 'hy';

  beforeAll(async () => {
    // Set required environment variables for the test
    process.env.DATABASE_URL =
      'postgresql://lilocharge:lilocharge_dev_password@localhost:5437/lilocharge_test';
    process.env.REDIS_URL = 'redis://localhost:6382';
    process.env.JWT_SECRET = 'test-jwt-secret-e2e';
    process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-e2e';
    process.env.JWT_EXPIRY = '1h';
    process.env.REFRESH_TOKEN_EXPIRY = '7d';
    process.env.AUTH_OTP_TTL_SECONDS = '300';
    process.env.AUTH_REFRESH_SESSION_TTL_SECONDS = '604800';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    // Apply global pipes and filters like in main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prismaService = moduleFixture.get<PrismaService>(PrismaService);
    redisService = moduleFixture.get<RedisService>(RedisService);
    jwtService = moduleFixture.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestData();
    await app.close();
  });

  beforeEach(async () => {
    // Clean up before each test to ensure isolation
    await cleanupTestData();
  });

  /**
   * Helper function to clean up test user and Redis keys.
   */
  async function cleanupTestData(): Promise<void> {
    try {
      await prismaService.user.deleteMany({
        where: {
          OR: [{ phone: TEST_PHONE }, { email: TEST_EMAIL }],
        },
      });
    } catch {
      // User may not exist, ignore error
    }

    try {
      await redisService.del(`auth:otp:${TEST_PHONE}`);
    } catch {
      // Key may not exist, ignore error
    }
  }

  /**
   * Given: A new user wants to register
   * When: They request an OTP for their phone number
   * Then: The system should store the OTP in Redis and return success
   */
  it('should request phone OTP successfully', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: {
        phone: TEST_PHONE,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { message: string; expiresInSeconds: number };
    expect(body.message).toBe('OTP sent successfully');
    expect(body.expiresInSeconds).toBe(300);

    // Verify OTP was stored in Redis
    const storedOtp = await redisService.get(`auth:otp:${TEST_PHONE}`);
    expect(storedOtp).not.toBeNull();
    expect(storedOtp).toMatch(/^\d{6}$/);
  });

  /**
   * Given: An OTP has been requested
   * When: The user verifies with correct OTP and registration details
   * Then: The system should create the user account and return valid JWT tokens
   */
  it('should verify OTP, create user, and return valid tokens', async () => {
    // GIVEN: Request OTP first
    const otpRequestResponse = await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: {
        phone: TEST_PHONE,
      },
    });
    expect(otpRequestResponse.statusCode).toBe(200);

    // Retrieve the OTP from Redis (in production, this would be sent via SMS)
    const otpCode = await redisService.get(`auth:otp:${TEST_PHONE}`);
    expect(otpCode).not.toBeNull();

    // WHEN: Verify OTP with registration details
    const verifyResponse = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: {
        phone: TEST_PHONE,
        code: otpCode,
        email: TEST_EMAIL,
        displayName: TEST_DISPLAY_NAME,
        password: TEST_PASSWORD,
        language: TEST_LANGUAGE,
      },
    });

    // THEN: Response should contain valid tokens
    expect(verifyResponse.statusCode).toBe(200);
    const tokenResponse = JSON.parse(verifyResponse.body) as AuthTokenPairResponse;
    expect(tokenResponse.tokenType).toBe('Bearer');
    expect(tokenResponse.accessToken).toBeTruthy();
    expect(tokenResponse.refreshToken).toBeTruthy();

    // Verify user was created in database
    const createdUser = await prismaService.user.findUnique({
      where: { email: TEST_EMAIL },
    });
    expect(createdUser).not.toBeNull();
    expect(createdUser?.phone).toBe(TEST_PHONE);
    expect(createdUser?.displayName).toBe(TEST_DISPLAY_NAME);
    expect(createdUser?.language).toBe('HY');
    expect(createdUser?.passwordHash).toBeTruthy();
    expect(createdUser?.passwordHash).not.toBe(TEST_PASSWORD); // Should be hashed

    // Verify OTP was deleted from Redis after successful verification
    const deletedOtp = await redisService.get(`auth:otp:${TEST_PHONE}`);
    expect(deletedOtp).toBeNull();
  });

  /**
   * Given: A user has completed registration
   * When: Access token is decoded
   * Then: The token should contain correct user claims
   */
  it('should issue access token with correct user claims', async () => {
    // GIVEN: Complete registration flow
    await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone: TEST_PHONE },
    });

    const otpCode = await redisService.get(`auth:otp:${TEST_PHONE}`);
    const verifyResponse = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: {
        phone: TEST_PHONE,
        code: otpCode,
        email: TEST_EMAIL,
        displayName: TEST_DISPLAY_NAME,
        password: TEST_PASSWORD,
        language: TEST_LANGUAGE,
      },
    });

    const tokenResponse = JSON.parse(verifyResponse.body) as AuthTokenPairResponse;

    // WHEN: Decode access token
    const accessTokenPayload = await jwtService.verifyAsync<AccessTokenPayload>(
      tokenResponse.accessToken,
      {
        secret: process.env.JWT_SECRET,
      },
    );

    // THEN: Token should contain correct claims
    expect(accessTokenPayload.tokenType).toBe('access');
    expect(accessTokenPayload.email).toBe(TEST_EMAIL);
    expect(accessTokenPayload.sub).toBeTruthy();

    // Verify sub matches the created user ID
    const user = await prismaService.user.findUnique({
      where: { email: TEST_EMAIL },
    });
    expect(accessTokenPayload.sub).toBe(user?.id);
  });

  /**
   * Given: A user has completed registration
   * When: Refresh token is decoded
   * Then: The token should contain correct claims and have valid session in Redis
   */
  it('should issue refresh token with valid session in Redis', async () => {
    // GIVEN: Complete registration flow
    await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone: TEST_PHONE },
    });

    const otpCode = await redisService.get(`auth:otp:${TEST_PHONE}`);
    const verifyResponse = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: {
        phone: TEST_PHONE,
        code: otpCode,
        email: TEST_EMAIL,
        displayName: TEST_DISPLAY_NAME,
        password: TEST_PASSWORD,
        language: TEST_LANGUAGE,
      },
    });

    const tokenResponse = JSON.parse(verifyResponse.body) as AuthTokenPairResponse;

    // WHEN: Decode refresh token
    const refreshTokenPayload = await jwtService.verifyAsync<RefreshTokenPayload>(
      tokenResponse.refreshToken,
      {
        secret: process.env.REFRESH_TOKEN_SECRET,
      },
    );

    // THEN: Token should have correct claims
    expect(refreshTokenPayload.tokenType).toBe('refresh');
    expect(refreshTokenPayload.sub).toBeTruthy();
    expect(refreshTokenPayload.jti).toBeTruthy();

    // Verify refresh session exists in Redis with matching JTI
    const user = await prismaService.user.findUnique({
      where: { email: TEST_EMAIL },
    });
    const storedJti = await redisService.get(`auth:refresh:${user?.id}`);
    expect(storedJti).toBe(refreshTokenPayload.jti);
  });

  /**
   * Given: An invalid OTP code
   * When: User attempts to verify with wrong code
   * Then: The system should reject the verification
   */
  it('should reject verification with invalid OTP code', async () => {
    // GIVEN: Request OTP
    await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone: TEST_PHONE },
    });

    // WHEN: Verify with wrong OTP code
    const verifyResponse = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: {
        phone: TEST_PHONE,
        code: '999999', // Wrong code
        email: TEST_EMAIL,
        displayName: TEST_DISPLAY_NAME,
        password: TEST_PASSWORD,
        language: TEST_LANGUAGE,
      },
    });

    // THEN: Should reject with 401
    expect(verifyResponse.statusCode).toBe(401);
  });

  /**
   * Given: A phone number already registered
   * When: User attempts to request OTP for that phone
   * Then: The system should reject with conflict error
   */
  it('should reject OTP request for already registered phone', async () => {
    // GIVEN: Complete registration for a user
    await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone: TEST_PHONE },
    });

    const otpCode = await redisService.get(`auth:otp:${TEST_PHONE}`);
    await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: {
        phone: TEST_PHONE,
        code: otpCode,
        email: TEST_EMAIL,
        displayName: TEST_DISPLAY_NAME,
        password: TEST_PASSWORD,
        language: TEST_LANGUAGE,
      },
    });

    // WHEN: Try to request OTP again for same phone
    const secondOtpRequest = await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone: TEST_PHONE },
    });

    // THEN: Should reject with 409 Conflict
    expect(secondOtpRequest.statusCode).toBe(409);
  });
});
