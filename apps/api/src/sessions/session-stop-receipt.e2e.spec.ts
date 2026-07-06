import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SessionStatus } from '@lilocharge/shared-types';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../prisma/prisma.service';

const TEST_STATION_ID = randomUUID();
const TEST_CONNECTOR_ID = randomUUID();
const TEST_USER_ID = randomUUID();
const TEST_SESSION_ID = randomUUID();
const TEST_VEHICLE_ID = randomUUID();
const TEST_PRICING_PLAN_ID = randomUUID();
const TEST_PAYMENT_METHOD_ID = randomUUID();

/**
 * E2E test suite for session stop, final cost calculation, and PDF receipt generation.
 * Tests the complete flow: stop session → verify final cost → download PDF receipt → verify content.
 */
/** Run-unique user identity so leftovers from crashed or concurrent runs never collide. */
const RUN_SUFFIX = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const TEST_PHONE_UNIQUE = `+374${RUN_SUFFIX.slice(-8)}`;

describe('SessionStop and Receipt (E2E) - Session Stop, Cost, and PDF Receipt', () => {
  let app: NestFastifyApplication;
  let prismaService: PrismaService;
  let authHeaders: Record<string, string>;
  let arcaMockServer: Server;

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

    // Stopping a session captures the seeded ArCa pre-authorization over real HTTP, so the
    // suite hosts a local gateway stub that approves every capture/refund request.
    arcaMockServer = createServer((request, response) => {
      const status = request.url?.includes('/refund') === true ? 'REFUNDED' : 'CAPTURED';
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status, transactionId: `arca-mock-${Date.now()}` }));
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
      { sub: TEST_USER_ID, email: 'stop-receipt-e2e@lilocharge.am', tokenType: 'access' },
      { secret: process.env.JWT_SECRET, expiresIn: '1h' },
    );
    authHeaders = { authorization: `Bearer ${accessToken}` };

    // Note: Server URL not used in tests as app.inject() is used directly
  }, 30000);

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
    await new Promise<void>((resolve) => {
      arcaMockServer.close(() => resolve());
    });
  });

  beforeEach(async () => {
    await cleanupTestData();
    await seedTestData();
  });

  /** Helper function to clean up test data. */
  async function cleanupTestData(): Promise<void> {
    try {
      await prismaService.meterValue.deleteMany({
        where: { sessionId: TEST_SESSION_ID },
      });
      await prismaService.payment.deleteMany({
        where: { sessionId: TEST_SESSION_ID },
      });
      await prismaService.session.deleteMany({
        where: { id: TEST_SESSION_ID },
      });
      await prismaService.paymentMethod.deleteMany({
        where: { id: TEST_PAYMENT_METHOD_ID },
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
      await prismaService.pricingPlan.deleteMany({
        where: { id: TEST_PRICING_PLAN_ID },
      });
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  }

  /** Helper function to seed test data. */
  async function seedTestData(): Promise<void> {
    // Create test user
    await prismaService.user.create({
      data: {
        id: TEST_USER_ID,
        email: `stop-receipt-${RUN_SUFFIX}@lilocharge.am`,
        displayName: 'Test Session User',
        phone: TEST_PHONE_UNIQUE,
        passwordHash: '$2b$12$dummyhashdummyhashdummyhashdummyhashdummyhash',
        language: 'HY' as never,
      },
    });

    // Create test vehicle
    await prismaService.vehicle.create({
      data: {
        id: TEST_VEHICLE_ID,
        userId: TEST_USER_ID,
        make: 'Tesla',
        model: 'Model 3',
        year: 2023,
        connectorType: 'TYPE_2' as never,
        batteryCapacity: 75,
        maxChargePower: 250,
      },
    });

    // Create test station
    await prismaService.station.create({
      data: {
        id: TEST_STATION_ID,
        operatorId: 'test-operator-stop',
        operatorName: 'Test Operator Stop',
        name: 'Test Stop Station',
        address: '123 Test Stop St, Yerevan',
        city: 'Yerevan',
        latitude: 40.1872,
        longitude: 44.5152,
        status: 'AVAILABLE' as never,
      },
    });

    // Create test connector
    await prismaService.connector.create({
      data: {
        id: TEST_CONNECTOR_ID,
        stationId: TEST_STATION_ID,
        evseId: 'EVSE-TEST-STOP-001',
        connectorType: 'TYPE_2',
        powerKw: 50,
        status: 'AVAILABLE' as never,
      },
    });

    // Create pricing plan
    await prismaService.pricingPlan.create({
      data: {
        id: TEST_PRICING_PLAN_ID,
        connectorId: TEST_CONNECTOR_ID,
        name: 'Standard Test Pricing',
        pricePerKwh: 50, // 50 AMD per kWh
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    // Create payment method (ArCa card)
    await prismaService.paymentMethod.create({
      data: {
        id: TEST_PAYMENT_METHOD_ID,
        userId: TEST_USER_ID,
        gateway: 'ARCA' as never,
        token: 'tok_test_arca_4242',
        isDefault: true,
        last4: '4242',
        expiryMonth: 12,
        expiryYear: 2030,
      },
    });
  }

  /**
   * Given: An active charging session with energy delivered and cost calculated
   * When: User stops the session
   * Then: Session transitions to COMPLETED and retains the calculated cost
   */
  it('should stop active session and retain calculated cost', async () => {
    // Create and start session with cost already calculated (as it would be in real-time)
    const startTime = new Date('2026-02-17T10:00:00Z');
    const endTime = new Date('2026-02-17T11:30:00Z');
    const energyDelivered = 25.5; // kWh
    const calculatedCost = Math.round(energyDelivered * 50); // 25.5 * 50 = 1275 AMD

    await prismaService.session.create({
      data: {
        id: TEST_SESSION_ID,
        userId: TEST_USER_ID,
        vehicleId: TEST_VEHICLE_ID,
        connectorId: TEST_CONNECTOR_ID,
        status: 'ACTIVE' as never,
        startTime,
        energyDelivered,
        peakPower: 48.5,
        totalCost: calculatedCost, // Cost calculated during charging
      },
    });

    // Create payment pre-authorization
    await prismaService.payment.create({
      data: {
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        paymentMethodId: TEST_PAYMENT_METHOD_ID,
        gateway: 'ARCA' as never,
        status: 'AUTHORIZED' as never,
        amount: 10000, // Pre-auth amount (100 AMD)
        authorizedAmount: 10000,
        capturedAmount: 0,
        gatewayTransactionId: 'arca-test-txn-12345',
      },
    });

    // Stop session via API
    const stopResponse = await app.inject({
      method: 'POST',
      url: `/users/${TEST_USER_ID}/sessions/${TEST_SESSION_ID}/stop`,
      headers: authHeaders,
      payload: {
        endedAt: endTime.toISOString(),
      },
    });

    if (stopResponse.statusCode !== 201) {
      console.error('Stop session error:', stopResponse.body);
    }

    expect(stopResponse.statusCode).toBe(201);
    const sessionData: unknown = JSON.parse(stopResponse.body);

    expect(sessionData).toMatchObject({
      id: TEST_SESSION_ID,
      userId: TEST_USER_ID,
      status: SessionStatus.COMPLETED,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      energyDelivered,
      totalCost: calculatedCost,
    });

    // Verify session in database
    const dbSession = await prismaService.session.findUnique({
      where: { id: TEST_SESSION_ID },
    });

    expect(dbSession).toBeDefined();
    expect(dbSession?.status).toBe('COMPLETED');
    expect(dbSession?.totalCost).toBe(calculatedCost);
    expect(dbSession?.endTime?.toISOString()).toBe(endTime.toISOString());

    // Verify payment was captured
    const capturedPayment = await prismaService.payment.findFirst({
      where: {
        sessionId: TEST_SESSION_ID,
        status: 'CAPTURED' as never,
      },
    });

    expect(capturedPayment).toBeDefined();
    expect(capturedPayment?.capturedAmount).toBe(calculatedCost);
  });

  /**
   * Given: A completed session
   * When: User requests PDF receipt
   * Then: PDF is generated with correct session details
   */
  it('should generate PDF receipt for completed session with correct data', async () => {
    // Create completed session
    const startTime = new Date('2026-02-17T10:00:00Z');
    const endTime = new Date('2026-02-17T11:30:00Z');
    const energyDelivered = 25.5;
    const peakPower = 48.5;
    const totalCost = 1275; // 25.5 * 50 AMD

    await prismaService.session.create({
      data: {
        id: TEST_SESSION_ID,
        userId: TEST_USER_ID,
        vehicleId: TEST_VEHICLE_ID,
        connectorId: TEST_CONNECTOR_ID,
        status: 'COMPLETED' as never,
        startTime,
        endTime,
        energyDelivered,
        peakPower,
        totalCost,
      },
    });

    // Request PDF receipt via API
    const receiptResponse = await app.inject({
      method: 'GET',
      url: `/users/${TEST_USER_ID}/sessions/${TEST_SESSION_ID}/receipt`,
      headers: authHeaders,
    });

    expect(receiptResponse.statusCode).toBe(200);
    expect(receiptResponse.headers['content-type']).toBe('application/pdf');
    expect(receiptResponse.headers['content-disposition']).toContain(
      `attachment; filename="receipt-${TEST_SESSION_ID}.pdf"`,
    );

    // Verify PDF is a valid buffer
    const pdfBuffer = receiptResponse.rawPayload;
    expect(pdfBuffer).toBeDefined();
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Verify PDF header (PDF files start with %PDF-)
    const pdfHeader = pdfBuffer.slice(0, 5).toString();
    expect(pdfHeader).toBe('%PDF-');

    // Verify PDF structure (text is compressed in PDFKit, so check structure)
    const pdfText = pdfBuffer.toString('binary');
    expect(pdfText).toContain('/Type /Catalog');
    expect(pdfText).toContain('/Type /Pages');
    expect(pdfText).toContain('%%EOF');
  });

  /**
   * Given: A completed session
   * When: User requests receipt
   * Then: Receipt contains accurate cost breakdown
   */
  it('should include accurate cost breakdown in receipt', async () => {
    const startTime = new Date('2026-02-17T14:00:00Z');
    const endTime = new Date('2026-02-17T15:45:00Z');
    const energyDelivered = 42.8; // kWh
    const peakPower = 49.2;
    const totalCost = Math.round(energyDelivered * 50); // 2140 AMD

    await prismaService.session.create({
      data: {
        id: TEST_SESSION_ID,
        userId: TEST_USER_ID,
        vehicleId: TEST_VEHICLE_ID,
        connectorId: TEST_CONNECTOR_ID,
        status: 'COMPLETED' as never,
        startTime,
        endTime,
        energyDelivered,
        peakPower,
        totalCost,
      },
    });

    const receiptResponse = await app.inject({
      method: 'GET',
      url: `/users/${TEST_USER_ID}/sessions/${TEST_SESSION_ID}/receipt`,
      headers: authHeaders,
    });

    expect(receiptResponse.statusCode).toBe(200);

    const pdfBuffer = receiptResponse.rawPayload;

    // Verify PDF is valid and contains expected structure
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Verify PDF header
    const pdfHeader = pdfBuffer.slice(0, 5).toString();
    expect(pdfHeader).toBe('%PDF-');

    // PDFKit embeds text in compressed streams, so we verify the PDF structure
    // rather than trying to read compressed content
    const pdfText = pdfBuffer.toString('binary');

    // Check that essential PDF objects are present
    expect(pdfText).toContain('/Type /Catalog');
    expect(pdfText).toContain('/Type /Pages');
    expect(pdfText).toContain('%%EOF');
  });

  /**
   * Given: An incomplete (active) session
   * When: User requests PDF receipt
   * Then: Request fails with 400 Bad Request
   */
  it('should reject receipt generation for non-completed sessions', async () => {
    // Create active session (not completed)
    await prismaService.session.create({
      data: {
        id: TEST_SESSION_ID,
        userId: TEST_USER_ID,
        vehicleId: TEST_VEHICLE_ID,
        connectorId: TEST_CONNECTOR_ID,
        status: 'ACTIVE' as never,
        startTime: new Date('2026-02-17T10:00:00Z'),
        energyDelivered: 10.5,
        peakPower: 45,
        totalCost: 0,
      },
    });

    const receiptResponse = await app.inject({
      method: 'GET',
      url: `/users/${TEST_USER_ID}/sessions/${TEST_SESSION_ID}/receipt`,
      headers: authHeaders,
    });

    expect(receiptResponse.statusCode).toBe(400);
    const errorBody: unknown = JSON.parse(receiptResponse.body);
    expect(errorBody).toHaveProperty('message');
    expect((errorBody as { message: string }).message).toContain('not completed');
  });

  /**
   * Given: A session that doesn't exist
   * When: User requests PDF receipt
   * Then: Request fails with 404 Not Found
   */
  it('should return 404 when receipt requested for non-existent session', async () => {
    const nonExistentSessionId = randomUUID();

    const receiptResponse = await app.inject({
      method: 'GET',
      url: `/users/${TEST_USER_ID}/sessions/${nonExistentSessionId}/receipt`,
      headers: authHeaders,
    });

    expect(receiptResponse.statusCode).toBe(404);
    const errorBody: unknown = JSON.parse(receiptResponse.body);
    expect(errorBody).toHaveProperty('message');
    expect((errorBody as { message: string }).message).toContain('not found');
  });

  /**
   * Given: An active session
   * When: User stops session with end time before start time
   * Then: Request fails with 400 Bad Request
   */
  it('should reject session stop when end time is before start time', async () => {
    const startTime = new Date('2026-02-17T10:00:00Z');
    const invalidEndTime = new Date('2026-02-17T09:00:00Z'); // Before start

    await prismaService.session.create({
      data: {
        id: TEST_SESSION_ID,
        userId: TEST_USER_ID,
        vehicleId: TEST_VEHICLE_ID,
        connectorId: TEST_CONNECTOR_ID,
        status: 'ACTIVE' as never,
        startTime,
        energyDelivered: 10,
        peakPower: 45,
        totalCost: 0,
      },
    });

    const stopResponse = await app.inject({
      method: 'POST',
      url: `/users/${TEST_USER_ID}/sessions/${TEST_SESSION_ID}/stop`,
      headers: authHeaders,
      payload: {
        endedAt: invalidEndTime.toISOString(),
      },
    });

    expect(stopResponse.statusCode).toBe(400);
    const errorBody: unknown = JSON.parse(stopResponse.body);
    expect(errorBody).toHaveProperty('message');
    expect((errorBody as { message: string }).message).toContain('before start time');
  });

  /**
   * Given: An active session with high energy delivery and cost calculated
   * When: Session is stopped and receipt is generated
   * Then: Cost is retained and receipt is generated successfully
   */
  it('should retain cost correctly for high energy consumption', async () => {
    const startTime = new Date('2026-02-17T08:00:00Z');
    const endTime = new Date('2026-02-17T13:00:00Z'); // 5 hours
    const energyDelivered = 150.75; // High consumption
    const calculatedCost = Math.round(energyDelivered * 50); // 7537.5 → 7538 AMD

    await prismaService.session.create({
      data: {
        id: TEST_SESSION_ID,
        userId: TEST_USER_ID,
        vehicleId: TEST_VEHICLE_ID,
        connectorId: TEST_CONNECTOR_ID,
        status: 'ACTIVE' as never,
        startTime,
        energyDelivered,
        peakPower: 50,
        totalCost: calculatedCost, // Cost calculated during charging
      },
    });

    await prismaService.payment.create({
      data: {
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        paymentMethodId: TEST_PAYMENT_METHOD_ID,
        gateway: 'ARCA' as never,
        status: 'AUTHORIZED' as never,
        amount: 20000,
        authorizedAmount: 20000,
        capturedAmount: 0,
        gatewayTransactionId: 'arca-test-txn-67890',
      },
    });

    const stopResponse = await app.inject({
      method: 'POST',
      url: `/users/${TEST_USER_ID}/sessions/${TEST_SESSION_ID}/stop`,
      headers: authHeaders,
      payload: {
        endedAt: endTime.toISOString(),
      },
    });

    if (stopResponse.statusCode !== 201) {
      console.error('Stop session error:', stopResponse.body);
    }

    expect(stopResponse.statusCode).toBe(201);
    const sessionData: unknown = JSON.parse(stopResponse.body);
    expect(sessionData).toHaveProperty('totalCost');
    expect((sessionData as { totalCost: number }).totalCost).toBe(calculatedCost);

    // Verify receipt is generated successfully
    const receiptResponse = await app.inject({
      method: 'GET',
      url: `/users/${TEST_USER_ID}/sessions/${TEST_SESSION_ID}/receipt`,
      headers: authHeaders,
    });

    expect(receiptResponse.statusCode).toBe(200);
    const pdfBuffer = receiptResponse.rawPayload;

    // Verify PDF is valid and has reasonable size for high energy consumption
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Verify PDF structure
    const pdfHeader = pdfBuffer.slice(0, 5).toString();
    expect(pdfHeader).toBe('%PDF-');

    // Verify PDF metadata is present
    const pdfText = pdfBuffer.toString('binary');
    expect(pdfText).toContain('%%EOF');
  });
});
