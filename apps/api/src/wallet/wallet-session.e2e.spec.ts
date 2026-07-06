import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SessionStatus } from '@lilocharge/shared-types';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../prisma/prisma.service';

const TEST_STATION_ID = randomUUID();
const TEST_CONNECTOR_ID = randomUUID();
const TEST_USER_ID = randomUUID();
const TEST_VEHICLE_ID = randomUUID();
const TEST_PRICING_PLAN_ID = randomUUID();

/** Run-unique user identity so leftovers from crashed or concurrent runs never collide. */
const RUN_SUFFIX = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const TEST_PHONE_UNIQUE = `+374${RUN_SUFFIX.slice(-8)}`;

/** Price per kWh (AMD) on the seeded pricing plan; sessions bill energy only. */
const PRICE_PER_KWH_AMD = 50;

/** One gateway call captured by the local ArCa mock for idempotency assertions. */
interface RecordedArcaRequest {
  readonly idempotencyKey: string | undefined;
  readonly url: string;
}

/**
 * E2E test suite for the wallet payment path: payment-method registration, ArCa-funded
 * top-up, and a full charging session (create → start → stop) debited from the wallet.
 * Also covers insufficient-balance failures and top-up payment-method validation.
 */
describe('Wallet and Session Payment (E2E) - top-up and wallet-funded session debit', () => {
  let app: NestFastifyApplication;
  let prismaService: PrismaService;
  let authHeaders: Record<string, string>;
  let arcaMockServer: Server;
  let recordedArcaRequests: RecordedArcaRequest[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL =
      'postgresql://lilocharge:lilocharge_dev_password@localhost:5437/lilocharge_test';
    process.env.REDIS_URL = 'redis://localhost:6382';
    process.env.JWT_SECRET = 'test-jwt-secret-e2e';
    process.env.CORS_ORIGIN = 'http://localhost:3000';
    process.env.OCPP_WS_ENABLED = 'false';
    process.env.MINIMUM_SESSION_BALANCE_AMD = '1000';
    process.env.ARCA_API_KEY = 'test-arca-api-key';
    process.env.ARCA_MERCHANT_ID = 'test-merchant-id';

    // Wallet top-ups charge the stored ArCa card over real HTTP (pre-authorize + capture),
    // so the suite hosts a local gateway stub that approves every operation and records the
    // Idempotency-Key headers it receives.
    arcaMockServer = createServer((request: IncomingMessage, response) => {
      const url = request.url ?? '';
      const idempotencyKeyHeader = request.headers['idempotency-key'];
      recordedArcaRequests.push({
        idempotencyKey: Array.isArray(idempotencyKeyHeader)
          ? idempotencyKeyHeader[0]
          : idempotencyKeyHeader,
        url,
      });

      let status = 'APPROVED';
      if (url.includes('/preauthorize')) {
        status = 'AUTHORIZED';
      } else if (url.includes('/capture')) {
        status = 'CAPTURED';
      } else if (url.includes('/refund')) {
        status = 'REFUNDED';
      }

      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ status, transactionId: `arca-mock-${recordedArcaRequests.length}` }),
      );
    });
    await new Promise<void>((resolve) => {
      arcaMockServer.listen(0, '127.0.0.1', () => resolve());
    });
    const arcaAddress = arcaMockServer.address() as AddressInfo;
    process.env.ARCA_BASE_URL = `http://127.0.0.1:${arcaAddress.port}`;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

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
    await app.listen(0);

    prismaService = moduleFixture.get<PrismaService>(PrismaService);

    // Every route below sits behind the global JwtAuthGuard + IdorGuard, so requests must carry
    // an access token whose sub matches the :userId path parameter.
    const jwtService = moduleFixture.get<JwtService>(JwtService);
    const accessToken = await jwtService.signAsync(
      { sub: TEST_USER_ID, email: 'wallet-session-e2e@lilocharge.am', tokenType: 'access' },
      { secret: process.env.JWT_SECRET, expiresIn: '1h' },
    );
    authHeaders = { authorization: `Bearer ${accessToken}` };
  }, 30000);

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
    await new Promise<void>((resolve) => {
      arcaMockServer.close(() => resolve());
    });
  });

  beforeEach(async () => {
    recordedArcaRequests = [];
    await cleanupTestData();
    await seedTestData();
  });

  /** Helper function to clean up test data (user-scoped so it also removes API-created rows). */
  async function cleanupTestData(): Promise<void> {
    try {
      await prismaService.walletTransaction.deleteMany({
        where: { wallet: { userId: TEST_USER_ID } },
      });
      await prismaService.wallet.deleteMany({
        where: { userId: TEST_USER_ID },
      });
      await prismaService.payment.deleteMany({
        where: { userId: TEST_USER_ID },
      });
      await prismaService.meterValue.deleteMany({
        where: { session: { userId: TEST_USER_ID } },
      });
      await prismaService.session.deleteMany({
        where: { userId: TEST_USER_ID },
      });
      await prismaService.paymentMethod.deleteMany({
        where: { userId: TEST_USER_ID },
      });
      await prismaService.pricingPlan.deleteMany({
        where: { id: TEST_PRICING_PLAN_ID },
      });
      await prismaService.connector.deleteMany({
        where: { id: TEST_CONNECTOR_ID },
      });
      await prismaService.station.deleteMany({
        where: { id: TEST_STATION_ID },
      });
      await prismaService.vehicle.deleteMany({
        where: { id: TEST_VEHICLE_ID },
      });
      await prismaService.user.deleteMany({
        where: { id: TEST_USER_ID },
      });
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  }

  /** Helper function to seed the user, vehicle, station, connector, and pricing plan. */
  async function seedTestData(): Promise<void> {
    await prismaService.user.create({
      data: {
        id: TEST_USER_ID,
        email: `wallet-session-${RUN_SUFFIX}@lilocharge.am`,
        displayName: 'Wallet Session User',
        phone: TEST_PHONE_UNIQUE,
        passwordHash: '$2b$12$dummyhashdummyhashdummyhashdummyhashdummyhash',
        language: 'HY' as never,
      },
    });

    await prismaService.vehicle.create({
      data: {
        id: TEST_VEHICLE_ID,
        userId: TEST_USER_ID,
        make: 'Nissan',
        model: 'Leaf',
        year: 2024,
        connectorType: 'TYPE_2' as never,
        batteryCapacity: 60,
        maxChargePower: 100,
      },
    });

    await prismaService.station.create({
      data: {
        id: TEST_STATION_ID,
        operatorId: `test-operator-wallet-${RUN_SUFFIX}`,
        operatorName: 'Test Operator Wallet',
        name: 'Test Wallet Station',
        address: '456 Wallet St, Yerevan',
        city: 'Yerevan',
        latitude: 40.1811,
        longitude: 44.5136,
        status: 'AVAILABLE' as never,
      },
    });

    await prismaService.connector.create({
      data: {
        id: TEST_CONNECTOR_ID,
        stationId: TEST_STATION_ID,
        evseId: `EVSE-TEST-WALLET-${RUN_SUFFIX}`,
        connectorType: 'TYPE_2',
        powerKw: 50,
        status: 'AVAILABLE' as never,
      },
    });

    await prismaService.pricingPlan.create({
      data: {
        id: TEST_PRICING_PLAN_ID,
        connectorId: TEST_CONNECTOR_ID,
        name: 'Wallet Test Pricing',
        pricePerKwh: PRICE_PER_KWH_AMD,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
  }

  /** Registers one tokenized ArCa card for the test user via the public API. */
  async function registerArcaPaymentMethod(): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: `/users/${TEST_USER_ID}/payments/methods`,
      headers: authHeaders,
      payload: {
        gateway: 'ARCA',
        token: `tok_e2e_arca_${RUN_SUFFIX}`,
        displayLabel: 'E2E ArCa card',
      },
    });

    expect(response.statusCode).toBe(201);
    const body: unknown = JSON.parse(response.body);
    return (body as { id: string }).id;
  }

  /** Sets the LiloCharge wallet as the user's default payment method via the public API. */
  async function setWalletAsDefaultPaymentMethod(): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: `/users/${TEST_USER_ID}/payments/wallet`,
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(201);
    const body: unknown = JSON.parse(response.body);
    expect(body).toMatchObject({ gateway: 'WALLET', isDefault: true });
    return (body as { id: string }).id;
  }

  /** Tops up the wallet with the given amount through the mocked ArCa gateway. */
  async function topUpWallet(amount: number, paymentMethodId: string): Promise<void> {
    const response = await app.inject({
      method: 'POST',
      url: `/users/${TEST_USER_ID}/wallet/top-up`,
      headers: authHeaders,
      payload: { amount, gateway: 'ARCA', paymentMethodId },
    });

    expect(response.statusCode).toBe(201);
  }

  /** Creates one pending session bound to the seeded connector and vehicle via the API. */
  async function createSessionViaApi(): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: `/users/${TEST_USER_ID}/sessions`,
      headers: authHeaders,
      payload: { connectorId: TEST_CONNECTOR_ID, vehicleId: TEST_VEHICLE_ID },
    });

    expect(response.statusCode).toBe(201);
    const body: unknown = JSON.parse(response.body);
    expect(body).toMatchObject({ status: SessionStatus.PENDING });
    return (body as { id: string }).id;
  }

  /**
   * Seeds meter values so the stop path bills `energyKwh` via the register-delta calculation
   * (energyActiveImport is in Wh; the service bills max - min).
   */
  async function seedMeterValues(sessionId: string, energyKwh: number): Promise<void> {
    const energyDeltaWh = energyKwh * 1000;
    await prismaService.meterValue.createMany({
      data: [
        {
          sessionId,
          timestamp: new Date('2026-03-01T10:00:00.000Z'),
          energyActiveImport: 0,
          powerActiveImport: 30000,
          currentImport: 60,
          voltage: 400,
        },
        {
          sessionId,
          timestamp: new Date('2026-03-01T10:30:00.000Z'),
          energyActiveImport: energyDeltaWh / 2,
          powerActiveImport: 30000,
          currentImport: 60,
          voltage: 400,
        },
        {
          sessionId,
          timestamp: new Date('2026-03-01T11:00:00.000Z'),
          energyActiveImport: energyDeltaWh,
          powerActiveImport: 30000,
          currentImport: 60,
          voltage: 400,
        },
      ],
    });
  }

  /**
   * Given: A user with no stored payment methods
   * When: They register an ArCa card and then enable the wallet payment method
   * Then: Both methods are stored and the wallet becomes the single default
   */
  it('should register an ArCa card and set wallet as the default payment method', async () => {
    const arcaMethodId = await registerArcaPaymentMethod();

    // The first registered method becomes the default automatically.
    const methodsBeforeWallet = await prismaService.paymentMethod.findFirst({
      where: { id: arcaMethodId },
      select: { isDefault: true, gateway: true },
    });
    expect(methodsBeforeWallet).toMatchObject({ gateway: 'ARCA', isDefault: true });

    const walletMethodId = await setWalletAsDefaultPaymentMethod();
    expect(walletMethodId).not.toBe(arcaMethodId);

    const listResponse = await app.inject({
      method: 'GET',
      url: `/users/${TEST_USER_ID}/payments/methods`,
      headers: authHeaders,
    });
    expect(listResponse.statusCode).toBe(200);
    const methods = JSON.parse(listResponse.body) as Array<{
      id: string;
      gateway: string;
      isDefault: boolean;
    }>;

    expect(methods).toHaveLength(2);
    const walletMethod = methods.find((method) => method.gateway === 'WALLET');
    const arcaMethod = methods.find((method) => method.gateway === 'ARCA');
    expect(walletMethod).toMatchObject({ id: walletMethodId, isDefault: true });
    expect(arcaMethod).toMatchObject({ id: arcaMethodId, isDefault: false });
  });

  /**
   * Given: A user with a stored ArCa card
   * When: They top up their wallet via ArCa against the mock gateway
   * Then: The balance increases and a TOP_UP ledger row with an idempotency key is recorded
   */
  it('should top up wallet via ArCa, increase balance, and record TOP_UP with idempotency key', async () => {
    const arcaMethodId = await registerArcaPaymentMethod();
    await setWalletAsDefaultPaymentMethod();

    const topUpResponse = await app.inject({
      method: 'POST',
      url: `/users/${TEST_USER_ID}/wallet/top-up`,
      headers: authHeaders,
      payload: { amount: 5000, gateway: 'ARCA', paymentMethodId: arcaMethodId },
    });

    expect(topUpResponse.statusCode).toBe(201);
    const topUpBody = JSON.parse(topUpResponse.body) as {
      newBalance: number;
      transaction: Record<string, unknown>;
    };
    expect(topUpBody.newBalance).toBe(5000);
    expect(topUpBody.transaction).toMatchObject({
      amount: 5000,
      balanceBefore: 0,
      balanceAfter: 5000,
      gateway: 'ARCA',
      type: 'TOP_UP',
    });

    // The mock gateway must have been charged for real (pre-authorize + capture).
    const preAuthCalls = recordedArcaRequests.filter((r) => r.url.includes('/preauthorize'));
    const captureCalls = recordedArcaRequests.filter((r) => r.url.includes('/capture'));
    expect(preAuthCalls).toHaveLength(1);
    expect(captureCalls).toHaveLength(1);

    // Balance is visible through the wallet endpoint.
    const walletResponse = await app.inject({
      method: 'GET',
      url: `/users/${TEST_USER_ID}/wallet`,
      headers: authHeaders,
    });
    expect(walletResponse.statusCode).toBe(200);
    expect(JSON.parse(walletResponse.body)).toMatchObject({ balance: 5000 });

    // Ledger row persists the idempotency key of the money-moving capture operation.
    const ledgerRow = await prismaService.walletTransaction.findFirst({
      where: { wallet: { userId: TEST_USER_ID }, type: 'TOP_UP' as never },
    });
    expect(ledgerRow).toBeDefined();
    expect(ledgerRow?.amount).toBe(5000);
    expect(ledgerRow?.idempotencyKey).toEqual(expect.any(String));
    expect(ledgerRow?.idempotencyKey).toBe(captureCalls[0]?.idempotencyKey);
    expect(ledgerRow?.gatewayTransactionId).toEqual(expect.any(String));
  });

  /**
   * Given: A wallet-default user with a topped-up balance
   * When: They create, start, and stop a charging session that delivered energy
   * Then: The session completes with totalCost > 0, the wallet is debited by exactly that
   *       cost with a DEDUCTION ledger row, and a captured WALLET payment is recorded
   */
  it('should debit wallet for a completed session (create → start → stop)', async () => {
    const arcaMethodId = await registerArcaPaymentMethod();
    await setWalletAsDefaultPaymentMethod();
    await topUpWallet(5000, arcaMethodId);

    const sessionId = await createSessionViaApi();

    const startResponse = await app.inject({
      method: 'POST',
      url: `/users/${TEST_USER_ID}/sessions/${sessionId}/start`,
      headers: authHeaders,
      payload: { startedAt: '2026-03-01T10:00:00.000Z' },
    });
    expect(startResponse.statusCode).toBe(201);
    expect(JSON.parse(startResponse.body)).toMatchObject({ status: SessionStatus.ACTIVE });

    // Wallet-funded starts must not pre-authorize any gateway payment.
    expect(recordedArcaRequests.filter((r) => r.url.includes('/preauthorize'))).toHaveLength(1); // top-up only
    const paymentsAfterStart = await prismaService.payment.count({
      where: { sessionId },
    });
    expect(paymentsAfterStart).toBe(0);

    // 20 kWh delivered → 20 * 50 = 1000 AMD via the register-delta cost path.
    const expectedCost = 20 * PRICE_PER_KWH_AMD;
    await seedMeterValues(sessionId, 20);

    const stopResponse = await app.inject({
      method: 'POST',
      url: `/users/${TEST_USER_ID}/sessions/${sessionId}/stop`,
      headers: authHeaders,
      payload: { endedAt: '2026-03-01T11:00:00.000Z' },
    });

    if (stopResponse.statusCode !== 201) {
      console.error('Stop session error:', stopResponse.body);
    }
    expect(stopResponse.statusCode).toBe(201);
    const stoppedSession: unknown = JSON.parse(stopResponse.body);
    expect(stoppedSession).toMatchObject({
      id: sessionId,
      status: SessionStatus.COMPLETED,
      energyDelivered: 20,
      totalCost: expectedCost,
    });
    expect((stoppedSession as { totalCost: number }).totalCost).toBeGreaterThan(0);

    // Wallet balance debited by exactly the session cost.
    const wallet = await prismaService.wallet.findUnique({
      where: { userId: TEST_USER_ID },
      select: { balance: true, id: true },
    });
    expect(wallet?.balance).toBe(5000 - expectedCost);

    // DEDUCTION ledger row links the session and reflects the balance movement.
    const deduction = await prismaService.walletTransaction.findFirst({
      where: { walletId: wallet?.id, type: 'DEDUCTION' as never },
    });
    expect(deduction).toBeDefined();
    expect(deduction).toMatchObject({
      amount: expectedCost,
      balanceBefore: 5000,
      balanceAfter: 5000 - expectedCost,
      sessionId,
    });

    // Wallet payments are captured immediately (no pre-auth/capture flow).
    const walletPayment = await prismaService.payment.findFirst({
      where: { sessionId },
    });
    expect(walletPayment).toMatchObject({
      gateway: 'WALLET',
      status: 'CAPTURED',
      amount: expectedCost,
      capturedAmount: expectedCost,
    });

    // No gateway capture was issued for the session itself (only the top-up captured).
    expect(recordedArcaRequests.filter((r) => r.url.includes('/capture'))).toHaveLength(1);
  });

  /**
   * Given: A wallet-default user whose balance is below the minimum session balance
   * When: They try to start a session
   * Then: The start is rejected with 400 and the session is left AUTHORIZED (pre-activation)
   */
  it('should reject session start when wallet balance is below the minimum', async () => {
    await registerArcaPaymentMethod();
    await setWalletAsDefaultPaymentMethod();
    // No top-up: wallet does not exist yet, so the balance check treats it as insufficient.

    const sessionId = await createSessionViaApi();

    const startResponse = await app.inject({
      method: 'POST',
      url: `/users/${TEST_USER_ID}/sessions/${sessionId}/start`,
      headers: authHeaders,
      payload: {},
    });

    expect(startResponse.statusCode).toBe(400);
    const errorBody: unknown = JSON.parse(startResponse.body);
    expect((errorBody as { message: string }).message).toBe(
      'Insufficient wallet balance. Minimum required: 1000 AMD',
    );

    // The PENDING → AUTHORIZED transition happens before the balance check, so the
    // session remains AUTHORIZED (not ACTIVE) and can be retried after a top-up.
    const dbSession = await prismaService.session.findUnique({
      where: { id: sessionId },
      select: { status: true, startTime: true },
    });
    expect(dbSession?.status).toBe('AUTHORIZED');
    expect(dbSession?.startTime).toBeNull();
  });

  /**
   * Given: An active wallet-funded session whose final cost exceeds the remaining balance
   * When: The user stops the session
   * Then: The stop request fails with 400 "Insufficient wallet balance"; the session is
   *       already finalized as COMPLETED but no deduction or payment record is written
   */
  it('should fail the stop with 400 when the session cost exceeds the wallet balance', async () => {
    const arcaMethodId = await registerArcaPaymentMethod();
    await setWalletAsDefaultPaymentMethod();
    // 1200 AMD passes the 1000 AMD minimum at start but cannot cover the 1500 AMD cost.
    await topUpWallet(1200, arcaMethodId);

    const sessionId = await createSessionViaApi();
    const startResponse = await app.inject({
      method: 'POST',
      url: `/users/${TEST_USER_ID}/sessions/${sessionId}/start`,
      headers: authHeaders,
      payload: { startedAt: '2026-03-01T10:00:00.000Z' },
    });
    expect(startResponse.statusCode).toBe(201);

    // 30 kWh delivered → 30 * 50 = 1500 AMD > 1200 AMD balance.
    await seedMeterValues(sessionId, 30);

    const stopResponse = await app.inject({
      method: 'POST',
      url: `/users/${TEST_USER_ID}/sessions/${sessionId}/stop`,
      headers: authHeaders,
      payload: { endedAt: '2026-03-01T11:00:00.000Z' },
    });

    expect(stopResponse.statusCode).toBe(400);
    const errorBody: unknown = JSON.parse(stopResponse.body);
    expect((errorBody as { message: string }).message).toBe('Insufficient wallet balance');

    // The session is finalized before the debit runs, so it is COMPLETED with the billed
    // cost even though the wallet debit was rejected (documented current behavior).
    const dbSession = await prismaService.session.findUnique({
      where: { id: sessionId },
      select: { status: true, totalCost: true },
    });
    expect(dbSession?.status).toBe('COMPLETED');
    expect(dbSession?.totalCost).toBe(1500);

    // No money moved: balance unchanged, no DEDUCTION ledger row, no payment record.
    const wallet = await prismaService.wallet.findUnique({
      where: { userId: TEST_USER_ID },
      select: { balance: true, id: true },
    });
    expect(wallet?.balance).toBe(1200);
    const deductionCount = await prismaService.walletTransaction.count({
      where: { walletId: wallet?.id, type: 'DEDUCTION' as never },
    });
    expect(deductionCount).toBe(0);
    const paymentCount = await prismaService.payment.count({ where: { sessionId } });
    expect(paymentCount).toBe(0);
  });

  /**
   * Given: A user topping up their wallet
   * When: The paymentMethodId is missing, malformed, or belongs to no stored method
   * Then: The top-up is rejected with 400/404 and no balance or ledger row is written
   */
  it('should reject top-up with missing or foreign paymentMethodId', async () => {
    await registerArcaPaymentMethod();

    // Missing paymentMethodId → 400.
    const missingResponse = await app.inject({
      method: 'POST',
      url: `/users/${TEST_USER_ID}/wallet/top-up`,
      headers: authHeaders,
      payload: { amount: 2000, gateway: 'ARCA' },
    });
    expect(missingResponse.statusCode).toBe(400);
    expect((JSON.parse(missingResponse.body) as { message: string }).message).toBe(
      'paymentMethodId is required for wallet top-up',
    );

    // Well-formed UUID that matches no stored method for this user → 404.
    const foreignResponse = await app.inject({
      method: 'POST',
      url: `/users/${TEST_USER_ID}/wallet/top-up`,
      headers: authHeaders,
      payload: { amount: 2000, gateway: 'ARCA', paymentMethodId: randomUUID() },
    });
    expect(foreignResponse.statusCode).toBe(404);
    expect((JSON.parse(foreignResponse.body) as { message: string }).message).toBe(
      'Payment method not found for this user',
    );

    // Nothing was charged and nothing was credited.
    expect(recordedArcaRequests).toHaveLength(0);
    const walletTransactionCount = await prismaService.walletTransaction.count({
      where: { wallet: { userId: TEST_USER_ID } },
    });
    expect(walletTransactionCount).toBe(0);
    const wallet = await prismaService.wallet.findUnique({
      where: { userId: TEST_USER_ID },
      select: { balance: true },
    });
    expect(wallet?.balance ?? 0).toBe(0);
  });
});
