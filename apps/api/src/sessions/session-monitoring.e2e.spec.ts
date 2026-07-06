import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  SESSION_MONITOR_SUBSCRIBE_EVENT,
  SESSION_MONITOR_UNSUBSCRIBE_EVENT,
  SESSION_MONITOR_UPDATE_EVENT,
  type SessionMonitorUpdateEvent,
} from '@lilocharge/shared-types';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';

import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../prisma/prisma.service';
import { SessionMonitoringService } from './session-monitoring.service';

const TEST_STATION_ID = '55555555-5555-5555-5555-555555555555';
const TEST_CONNECTOR_ID = '33333333-3333-3333-3333-333333333333';
const TEST_USER_ID = '99999999-9999-9999-9999-999999999999';
const TEST_SESSION_ID = '88888888-8888-8888-8888-888888888888';
const TEST_TRANSACTION_ID = '7799';
const TEST_PRICING_PLAN_ID = '77777777-7777-7777-7777-777777777777';

/**
 * E2E test suite for real-time session monitoring with WebSocket updates and cost calculation.
 * Tests the complete flow: start session → emit meter values → receive WebSocket updates → verify cost accuracy.
 */
/** Run-unique user identity so leftovers from crashed or concurrent runs never collide. */
const RUN_SUFFIX = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const TEST_PHONE_UNIQUE = `+374${RUN_SUFFIX.slice(-8)}`;

describe('SessionMonitoring (E2E) - Real-Time Session Updates and Cost Calculation', () => {
  let app: NestFastifyApplication;
  let prismaService: PrismaService;
  let sessionMonitoringService: SessionMonitoringService;
  let socketClient: Socket;
  let serverUrl: string;

  beforeAll(async () => {
    process.env.DATABASE_URL =
      'postgresql://lilocharge:lilocharge_dev_password@localhost:5437/lilocharge_test';
    process.env.REDIS_URL = 'redis://localhost:6382';
    process.env.JWT_SECRET = 'test-jwt-secret-e2e';
    process.env.CORS_ORIGIN = 'http://localhost:3000';
    process.env.OCPP_WS_ENABLED = 'false';

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
    sessionMonitoringService =
      moduleFixture.get<SessionMonitoringService>(SessionMonitoringService);

    const address = app.getHttpServer().address();
    const port = typeof address === 'string' ? 3000 : (address?.port ?? 3000);
    serverUrl = `http://localhost:${port}`;
  }, 30000);

  afterAll(async () => {
    if (socketClient?.connected) {
      socketClient.disconnect();
    }
    await cleanupTestData();
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();
    await seedTestData();
  });

  afterEach(() => {
    if (socketClient?.connected) {
      socketClient.disconnect();
    }
  });

  /** Helper function to clean up test data. */
  async function cleanupTestData(): Promise<void> {
    try {
      await prismaService.meterValue.deleteMany({
        where: { sessionId: TEST_SESSION_ID },
      });
      await prismaService.session.deleteMany({
        where: { id: TEST_SESSION_ID },
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
      await prismaService.user.deleteMany({
        where: { id: TEST_USER_ID },
      });
    } catch {
      // Ignore cleanup errors
    }
  }

  /** Helper function to seed test data for session monitoring tests. */
  async function seedTestData(): Promise<void> {
    await prismaService.user.create({
      data: {
        id: TEST_USER_ID,
        email: `monitoring-${RUN_SUFFIX}@lilocharge.am`,
        phone: TEST_PHONE_UNIQUE,
        displayName: 'Test User E2E',
        passwordHash: 'hashed-password',
        language: 'HY',
      },
    });

    await prismaService.station.create({
      data: {
        id: TEST_STATION_ID,
        operatorId: 'test-operator',
        operatorName: 'Test Operator',
        name: 'Test Station E2E',
        address: 'Test Address',
        city: 'Yerevan',
        latitude: 40.1872,
        longitude: 44.5152,
        status: 'AVAILABLE',
      },
    });

    await prismaService.connector.create({
      data: {
        id: TEST_CONNECTOR_ID,
        stationId: TEST_STATION_ID,
        evseId: 'EVSE-001',
        connectorType: 'CCS',
        powerKw: 50,
        status: 'AVAILABLE',
      },
    });

    await prismaService.pricingPlan.create({
      data: {
        id: TEST_PRICING_PLAN_ID,
        connectorId: TEST_CONNECTOR_ID,
        name: 'Test Pricing Plan',
        pricePerKwh: 150,
        pricePerMinute: 10,
        sessionFee: 500,
        idleFee: 20,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        validUntil: null,
      },
    });

    await prismaService.session.create({
      data: {
        id: TEST_SESSION_ID,
        userId: TEST_USER_ID,
        connectorId: TEST_CONNECTOR_ID,
        status: 'ACTIVE',
        transactionId: TEST_TRANSACTION_ID,
        startTime: new Date('2026-02-17T12:00:00.000Z'),
        energyDelivered: 0,
        totalCost: 0,
        createdAt: new Date('2026-02-17T12:00:00.000Z'),
      },
    });
  }

  /** Helper function to create a WebSocket client and wait for connection. */
  async function createSocketClient(): Promise<Socket> {
    return new Promise<Socket>((resolve, reject) => {
      const client = io(serverUrl, {
        transports: ['websocket'],
        reconnection: false,
      });

      const timeout = setTimeout(() => {
        client.close();
        reject(new Error('Socket connection timeout'));
      }, 5000);

      client.on('connect', () => {
        clearTimeout(timeout);
        resolve(client);
      });

      client.on('connect_error', (error: Error) => {
        clearTimeout(timeout);
        client.close();
        reject(error);
      });
    });
  }

  /** Helper function to wait for a specific WebSocket event. */
  async function waitForEvent<T>(
    client: Socket,
    eventName: string,
    timeoutMs: number = 5000,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${eventName}`));
      }, timeoutMs);

      client.once(eventName, (payload: T) => {
        clearTimeout(timeout);
        resolve(payload);
      });
    });
  }

  describe('Given an active charging session with meter values', () => {
    describe('When a client subscribes to session monitoring', () => {
      it('Then receives real-time WebSocket updates with accurate power and energy metrics', async () => {
        socketClient = await createSocketClient();

        const updatePromise = waitForEvent<SessionMonitorUpdateEvent>(
          socketClient,
          SESSION_MONITOR_UPDATE_EVENT,
        );

        socketClient.emit(SESSION_MONITOR_SUBSCRIBE_EVENT, {
          sessionId: TEST_SESSION_ID,
        });

        await prismaService.meterValue.createMany({
          data: [
            {
              id: randomUUID(),
              sessionId: TEST_SESSION_ID,
              timestamp: new Date('2026-02-17T12:10:00.000Z'),
              energyActiveImport: 10_000,
              powerActiveImport: 7_200,
              currentImport: 104,
              voltage: 230,
            },
            {
              id: randomUUID(),
              sessionId: TEST_SESSION_ID,
              timestamp: new Date('2026-02-17T12:20:00.000Z'),
              energyActiveImport: 16_200,
              powerActiveImport: 7_400,
              currentImport: 105,
              voltage: 232,
            },
          ],
        });

        await sessionMonitoringService.publishSessionMonitorUpdate(TEST_SESSION_ID);

        const update = await updatePromise;

        expect(update.sessionId).toBe(TEST_SESSION_ID);
        expect(update.connectorId).toBe(TEST_CONNECTOR_ID);
        expect(update.transactionId).toBe(TEST_TRANSACTION_ID);
        expect(update.energyDeliveredKwh).toBe(6.2);
        expect(update.powerKw).toBe(7.4);
        expect(update.event).toBe(SESSION_MONITOR_UPDATE_EVENT);
        expect(update.timestamp).toBe('2026-02-17T12:20:00.000Z');
        expect(update.totalCost).toBeGreaterThan(0);
      });

      it('Then calculates accurate total cost including energy, time, and session fees', async () => {
        socketClient = await createSocketClient();

        const updatePromise = waitForEvent<SessionMonitorUpdateEvent>(
          socketClient,
          SESSION_MONITOR_UPDATE_EVENT,
        );

        socketClient.emit(SESSION_MONITOR_SUBSCRIBE_EVENT, {
          sessionId: TEST_SESSION_ID,
        });

        await prismaService.meterValue.createMany({
          data: [
            {
              id: randomUUID(),
              sessionId: TEST_SESSION_ID,
              timestamp: new Date('2026-02-17T12:00:00.000Z'),
              energyActiveImport: 10_000,
              powerActiveImport: 7_000,
              currentImport: 100,
              voltage: 230,
            },
            {
              id: randomUUID(),
              sessionId: TEST_SESSION_ID,
              timestamp: new Date('2026-02-17T12:30:00.000Z'),
              energyActiveImport: 18_000,
              powerActiveImport: 7_200,
              currentImport: 105,
              voltage: 230,
            },
          ],
        });

        await sessionMonitoringService.publishSessionMonitorUpdate(TEST_SESSION_ID);

        const update = await updatePromise;

        expect(update.energyDeliveredKwh).toBe(8);
        expect(update.powerKw).toBe(7.2);

        const expectedEnergyCost = 8 * 150;
        const expectedTimeCost = 30 * 10;
        const expectedSessionFee = 500;
        const expectedTotalCost = expectedEnergyCost + expectedTimeCost + expectedSessionFee;

        expect(update.totalCost).toBe(expectedTotalCost);
      });

      it('Then correctly identifies idle time and charges idle fees when charging stops', async () => {
        socketClient = await createSocketClient();

        const updatePromise = waitForEvent<SessionMonitorUpdateEvent>(
          socketClient,
          SESSION_MONITOR_UPDATE_EVENT,
        );

        socketClient.emit(SESSION_MONITOR_SUBSCRIBE_EVENT, {
          sessionId: TEST_SESSION_ID,
        });

        await prismaService.meterValue.createMany({
          data: [
            {
              id: randomUUID(),
              sessionId: TEST_SESSION_ID,
              timestamp: new Date('2026-02-17T12:00:00.000Z'),
              energyActiveImport: 10_000,
              powerActiveImport: 7_000,
              currentImport: 100,
              voltage: 230,
            },
            {
              id: randomUUID(),
              sessionId: TEST_SESSION_ID,
              timestamp: new Date('2026-02-17T12:20:00.000Z'),
              energyActiveImport: 17_000,
              powerActiveImport: 6_800,
              currentImport: 99,
              voltage: 230,
            },
            {
              id: randomUUID(),
              sessionId: TEST_SESSION_ID,
              timestamp: new Date('2026-02-17T12:30:00.000Z'),
              energyActiveImport: 17_000,
              powerActiveImport: 0,
              currentImport: 0,
              voltage: 230,
            },
          ],
        });

        await sessionMonitoringService.publishSessionMonitorUpdate(TEST_SESSION_ID);

        const update = await updatePromise;

        expect(update.energyDeliveredKwh).toBe(7);

        const chargingMinutes = 20;
        const idleMinutes = 10;
        const expectedEnergyCost = 7 * 150;
        const expectedChargingTimeCost = chargingMinutes * 10;
        const expectedIdleCost = idleMinutes * 20;
        const expectedSessionFee = 500;
        const expectedTotalCost =
          expectedEnergyCost + expectedChargingTimeCost + expectedIdleCost + expectedSessionFee;

        expect(update.totalCost).toBe(expectedTotalCost);
      });
    });

    describe('When a client unsubscribes from session monitoring', () => {
      it('Then stops receiving updates for that session', async () => {
        socketClient = await createSocketClient();

        socketClient.emit(SESSION_MONITOR_SUBSCRIBE_EVENT, {
          sessionId: TEST_SESSION_ID,
        });

        await new Promise((resolve) => setTimeout(resolve, 100));

        socketClient.emit(SESSION_MONITOR_UNSUBSCRIBE_EVENT, {
          sessionId: TEST_SESSION_ID,
        });

        await new Promise((resolve) => setTimeout(resolve, 100));

        const receivedUpdates: SessionMonitorUpdateEvent[] = [];
        socketClient.on(SESSION_MONITOR_UPDATE_EVENT, (update: SessionMonitorUpdateEvent) => {
          receivedUpdates.push(update);
        });

        await prismaService.meterValue.create({
          data: {
            id: randomUUID(),
            sessionId: TEST_SESSION_ID,
            timestamp: new Date('2026-02-17T12:40:00.000Z'),
            energyActiveImport: 20_000,
            powerActiveImport: 7_500,
            currentImport: 108,
            voltage: 230,
          },
        });

        await sessionMonitoringService.publishSessionMonitorUpdate(TEST_SESSION_ID);

        await new Promise((resolve) => setTimeout(resolve, 500));

        expect(receivedUpdates).toHaveLength(0);
      });
    });

    describe('When multiple meter values are ingested in sequence', () => {
      it('Then each update reflects the cumulative energy delivered and latest power reading', async () => {
        socketClient = await createSocketClient();

        const updates: SessionMonitorUpdateEvent[] = [];
        socketClient.on(SESSION_MONITOR_UPDATE_EVENT, (update: SessionMonitorUpdateEvent) => {
          updates.push(update);
        });

        socketClient.emit(SESSION_MONITOR_SUBSCRIBE_EVENT, {
          sessionId: TEST_SESSION_ID,
        });

        await new Promise((resolve) => setTimeout(resolve, 100));

        await prismaService.meterValue.create({
          data: {
            id: randomUUID(),
            sessionId: TEST_SESSION_ID,
            timestamp: new Date('2026-02-17T12:10:00.000Z'),
            energyActiveImport: 10_000,
            powerActiveImport: 7_000,
            currentImport: 100,
            voltage: 230,
          },
        });
        await sessionMonitoringService.publishSessionMonitorUpdate(TEST_SESSION_ID);
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(updates).toHaveLength(1);
        expect(updates[0].energyDeliveredKwh).toBe(0);
        expect(updates[0].powerKw).toBe(7);

        await prismaService.meterValue.create({
          data: {
            id: randomUUID(),
            sessionId: TEST_SESSION_ID,
            timestamp: new Date('2026-02-17T12:20:00.000Z'),
            energyActiveImport: 16_000,
            powerActiveImport: 7_200,
            currentImport: 104,
            voltage: 230,
          },
        });
        await sessionMonitoringService.publishSessionMonitorUpdate(TEST_SESSION_ID);
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(updates).toHaveLength(2);
        expect(updates[1].energyDeliveredKwh).toBe(6);
        expect(updates[1].powerKw).toBe(7.2);

        await prismaService.meterValue.create({
          data: {
            id: randomUUID(),
            sessionId: TEST_SESSION_ID,
            timestamp: new Date('2026-02-17T12:30:00.000Z'),
            energyActiveImport: 22_500,
            powerActiveImport: 7_400,
            currentImport: 106,
            voltage: 230,
          },
        });
        await sessionMonitoringService.publishSessionMonitorUpdate(TEST_SESSION_ID);
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(updates).toHaveLength(3);
        expect(updates[2].energyDeliveredKwh).toBe(12.5);
        expect(updates[2].powerKw).toBe(7.4);
        expect(updates[2].totalCost).toBeGreaterThan(updates[1].totalCost);
        expect(updates[1].totalCost).toBeGreaterThan(updates[0].totalCost);
      });
    });

    describe('When session has no meter values', () => {
      it('Then does not emit any updates', async () => {
        socketClient = await createSocketClient();

        const receivedUpdates: SessionMonitorUpdateEvent[] = [];
        socketClient.on(SESSION_MONITOR_UPDATE_EVENT, (update: SessionMonitorUpdateEvent) => {
          receivedUpdates.push(update);
        });

        socketClient.emit(SESSION_MONITOR_SUBSCRIBE_EVENT, {
          sessionId: TEST_SESSION_ID,
        });

        await new Promise((resolve) => setTimeout(resolve, 100));

        await sessionMonitoringService.publishSessionMonitorUpdate(TEST_SESSION_ID);

        await new Promise((resolve) => setTimeout(resolve, 500));

        expect(receivedUpdates).toHaveLength(0);
      });
    });
  });
});
