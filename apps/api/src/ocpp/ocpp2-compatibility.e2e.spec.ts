import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type {
  Ocpp2AuthorizeResponse,
  Ocpp2BootNotificationResponse,
  Ocpp2HeartbeatResponse,
  Ocpp2TransactionEventResponse,
} from '@lilocharge/shared-types';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { RPCClient } from 'ocpp-rpc';

import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../prisma/prisma.service';
import { OcppIdTagService } from './ocpp.id-tag.service';
import { OcppRegistryService } from './ocpp.registry.service';
import { OcppRemoteStartService } from './ocpp.remote-start.service';

const TEST_CHARGE_POINT_ID = 'CP2-TEST-001';
const TEST_LEGACY_CHARGE_POINT_ID = 'CP2-LEGACY-001';
const TEST_EVSE_ID = 1;
const TEST_STATION_ID = '61111111-1111-1111-1111-111111111111';
const TEST_LEGACY_STATION_ID = '61111111-1111-1111-1111-111111111112';
const TEST_CONNECTOR_ID = '62222222-2222-2222-2222-222222222222';
const TEST_LEGACY_CONNECTOR_ID = '62222222-2222-2222-2222-222222222223';
const TEST_USER_ID = '63333333-3333-3333-3333-333333333333';
const TEST_PRICING_PLAN_ID = '64444444-4444-4444-4444-444444444444';
const OCPP_SERVER_PORT = 9222;
const OCPP_SERVER_HOST = '127.0.0.1';

/** Run-unique user identity so leftovers from crashed or concurrent runs never collide. */
const RUN_SUFFIX = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const TEST_PHONE_UNIQUE = `+374${RUN_SUFFIX.slice(-8)}`;

/**
 * OCPP 2.0.1 Compatibility E2E Test Suite.
 *
 * Exercises the 2.0.1 core charging profile over a real WebSocket connection:
 * subprotocol negotiation, BootNotification, Heartbeat, StatusNotification,
 * Authorize, the TransactionEvent Started -> Updated -> Ended lifecycle with
 * session billing, RequestStartTransaction dispatch, and coexistence with a
 * simultaneously connected OCPP 1.6-J charge point.
 */
describe('OCPP 2.0.1 Compatibility (E2E) - Charge Point Communication', () => {
  let app: NestFastifyApplication;
  let prismaService: PrismaService;
  let registryService: OcppRegistryService;
  let idTagService: OcppIdTagService;
  let remoteStartService: OcppRemoteStartService;
  let ocppClient: RPCClient | null = null;
  let legacyClient: RPCClient | null = null;

  beforeAll(async () => {
    process.env.DATABASE_URL =
      'postgresql://lilocharge:lilocharge_dev_password@localhost:5437/lilocharge_test';
    process.env.REDIS_URL = 'redis://localhost:6382';
    process.env.JWT_SECRET = 'test-jwt-secret-ocpp2-e2e';
    process.env.CORS_ORIGIN = 'http://localhost:3000';
    process.env.OCPP_WS_ENABLED = 'true';
    process.env.OCPP_WS_PORT = String(OCPP_SERVER_PORT);
    process.env.OCPP_WS_HOST = OCPP_SERVER_HOST;

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

    prismaService = moduleFixture.get<PrismaService>(PrismaService);
    registryService = moduleFixture.get<OcppRegistryService>(OcppRegistryService);
    idTagService = moduleFixture.get<OcppIdTagService>(OcppIdTagService);
    remoteStartService = moduleFixture.get<OcppRemoteStartService>(OcppRemoteStartService);

    // Allow OCPP server time to start
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }, 45000);

  afterAll(async () => {
    await closeClients();
    await cleanupTestData();
    await app.close();
  }, 30000);

  beforeEach(async () => {
    await closeClients();
    await cleanupTestData();
    await seedTestData();
  });

  afterEach(async () => {
    await closeClients();
  });

  async function closeClients(): Promise<void> {
    if (ocppClient !== null) {
      await ocppClient.close();
      ocppClient = null;
    }

    if (legacyClient !== null) {
      await legacyClient.close();
      legacyClient = null;
    }
  }

  /** Cleans up test database records created during test execution. */
  async function cleanupTestData(): Promise<void> {
    try {
      await prismaService.session.deleteMany({
        where: { connectorId: { in: [TEST_CONNECTOR_ID, TEST_LEGACY_CONNECTOR_ID] } },
      });
      await prismaService.pricingPlan.deleteMany({
        where: { connectorId: { in: [TEST_CONNECTOR_ID, TEST_LEGACY_CONNECTOR_ID] } },
      });
      await prismaService.connector.deleteMany({
        where: { id: { in: [TEST_CONNECTOR_ID, TEST_LEGACY_CONNECTOR_ID] } },
      });
      await prismaService.station.deleteMany({
        where: { id: { in: [TEST_STATION_ID, TEST_LEGACY_STATION_ID] } },
      });
      await prismaService.user.deleteMany({
        where: { id: TEST_USER_ID },
      });
    } catch {
      // Ignore cleanup errors
    }
  }

  /** Seeds database with test fixtures for OCPP 2.0.1 compatibility testing. */
  async function seedTestData(): Promise<void> {
    await prismaService.user.create({
      data: {
        id: TEST_USER_ID,
        email: `test-ocpp2-${RUN_SUFFIX}@lilocharge.am`,
        passwordHash: '$2b$12$abcdefghijklmnopqrstuv',
        phone: TEST_PHONE_UNIQUE,
        displayName: 'OCPP2 Test User',
        language: 'HY',
      },
    });

    // OCPP services resolve connectors scoped to station.operatorId === charge point identity.
    await prismaService.station.create({
      data: {
        id: TEST_STATION_ID,
        name: 'Test OCPP2 Station',
        address: 'Test Address',
        city: 'Yerevan',
        latitude: 40.1776,
        longitude: 44.5126,
        operatorId: TEST_CHARGE_POINT_ID,
        operatorName: 'Test Operator',
        status: 'AVAILABLE',
      },
    });
    await prismaService.station.create({
      data: {
        id: TEST_LEGACY_STATION_ID,
        name: 'Test OCPP 1.6 Station',
        address: 'Test Address 2',
        city: 'Yerevan',
        latitude: 40.18,
        longitude: 44.51,
        operatorId: TEST_LEGACY_CHARGE_POINT_ID,
        operatorName: 'Test Operator',
        status: 'AVAILABLE',
      },
    });

    await prismaService.connector.create({
      data: {
        id: TEST_CONNECTOR_ID,
        stationId: TEST_STATION_ID,
        evseId: `${TEST_CHARGE_POINT_ID}-evse-${TEST_EVSE_ID}`,
        connectorType: 'CCS',
        powerKw: 150,
        status: 'AVAILABLE',
        lastStatusUpdate: new Date('2026-02-17T08:00:00.000Z'),
      },
    });
    await prismaService.connector.create({
      data: {
        id: TEST_LEGACY_CONNECTOR_ID,
        stationId: TEST_LEGACY_STATION_ID,
        evseId: `${TEST_LEGACY_CHARGE_POINT_ID}-evse-1`,
        connectorType: 'TYPE_2',
        powerKw: 22,
        status: 'AVAILABLE',
        lastStatusUpdate: new Date('2026-02-17T08:00:00.000Z'),
      },
    });

    await prismaService.pricingPlan.create({
      data: {
        id: TEST_PRICING_PLAN_ID,
        connectorId: TEST_CONNECTOR_ID,
        name: 'Test 2.0.1 Pricing Plan',
        pricePerKwh: 150,
        pricePerMinute: 0,
        sessionFee: 0,
        idleFee: 0,
        validFrom: new Date('2026-02-17T00:00:00.000Z'),
        validUntil: null,
      },
    });
  }

  /** Creates and connects an OCPP client negotiating the requested subprotocols. */
  async function createClient(
    chargePointId: string,
    protocols: readonly string[],
  ): Promise<RPCClient> {
    // @ts-expect-error: ocpp-rpc type definitions may be incomplete
    const client = new RPCClient({
      endpoint: `ws://${OCPP_SERVER_HOST}:${OCPP_SERVER_PORT}/${chargePointId}`,
      identity: chargePointId,
      protocols: [...protocols],
      strictMode: true,
      reconnect: false,
    });

    const connectTimeout = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error('OCPP client connection timeout')), 5000);
      timer.unref();
    });

    await Promise.race([client.connect(), connectTimeout]);

    return client;
  }

  /** Sends one 2.0.1 BootNotification with a schema-valid payload. */
  async function sendBootNotification(client: RPCClient): Promise<Ocpp2BootNotificationResponse> {
    return (await client.call('BootNotification', {
      reason: 'PowerUp',
      chargingStation: {
        model: 'Terra AC',
        vendorName: 'ABB',
        firmwareVersion: '1.6.5',
      },
    })) as Ocpp2BootNotificationResponse;
  }

  describe('Subprotocol negotiation', () => {
    it('negotiates ocpp2.0.1 for a 2.0.1-only charge point', async () => {
      ocppClient = await createClient(TEST_CHARGE_POINT_ID, ['ocpp2.0.1']);

      expect(ocppClient.protocol).toBe('ocpp2.0.1');
      expect(registryService.getChargePoint(TEST_CHARGE_POINT_ID)).toBeDefined();
    });

    it('still negotiates ocpp1.6 for a legacy charge point', async () => {
      legacyClient = await createClient(TEST_LEGACY_CHARGE_POINT_ID, ['ocpp1.6']);

      expect(legacyClient.protocol).toBe('ocpp1.6');
    });
  });

  describe('BootNotification and Heartbeat', () => {
    it('accepts a 2.0.1 BootNotification with current time and interval', async () => {
      ocppClient = await createClient(TEST_CHARGE_POINT_ID, ['ocpp2.0.1']);

      const response = await sendBootNotification(ocppClient);

      expect(response.status).toBe('Accepted');
      expect(Number.isFinite(Date.parse(response.currentTime))).toBe(true);
      expect(response.interval).toBeGreaterThan(0);
    });

    it('answers 2.0.1 Heartbeat with the central system time', async () => {
      ocppClient = await createClient(TEST_CHARGE_POINT_ID, ['ocpp2.0.1']);
      await sendBootNotification(ocppClient);

      const response = (await ocppClient.call('Heartbeat', {})) as Ocpp2HeartbeatResponse;

      expect(Number.isFinite(Date.parse(response.currentTime))).toBe(true);
    });
  });

  describe('StatusNotification', () => {
    it('maps Occupied connector status onto the connector record', async () => {
      ocppClient = await createClient(TEST_CHARGE_POINT_ID, ['ocpp2.0.1']);
      await sendBootNotification(ocppClient);

      const response = await ocppClient.call('StatusNotification', {
        timestamp: new Date().toISOString(),
        connectorStatus: 'Occupied',
        evseId: TEST_EVSE_ID,
        connectorId: 1,
      });

      expect(response).toEqual({});

      const connector = await prismaService.connector.findUnique({
        where: { id: TEST_CONNECTOR_ID },
      });
      expect(connector?.status).toBe('OCCUPIED');
    });

    it('maps Faulted connector status onto MAINTENANCE', async () => {
      ocppClient = await createClient(TEST_CHARGE_POINT_ID, ['ocpp2.0.1']);
      await sendBootNotification(ocppClient);

      await ocppClient.call('StatusNotification', {
        timestamp: new Date().toISOString(),
        connectorStatus: 'Faulted',
        evseId: TEST_EVSE_ID,
        connectorId: 1,
      });

      const connector = await prismaService.connector.findUnique({
        where: { id: TEST_CONNECTOR_ID },
      });
      expect(connector?.status).toBe('MAINTENANCE');
    });
  });

  describe('Authorize', () => {
    it('accepts an issued idToken and rejects an unknown one', async () => {
      ocppClient = await createClient(TEST_CHARGE_POINT_ID, ['ocpp2.0.1']);
      await sendBootNotification(ocppClient);

      const issued = await idTagService.issueIdTag(TEST_USER_ID);
      const accepted = (await ocppClient.call('Authorize', {
        idToken: { idToken: issued, type: 'Central' },
      })) as Ocpp2AuthorizeResponse;
      expect(accepted.idTokenInfo.status).toBe('Accepted');

      const rejected = (await ocppClient.call('Authorize', {
        idToken: { idToken: 'unknown-token-000000', type: 'Central' },
      })) as Ocpp2AuthorizeResponse;
      expect(rejected.idTokenInfo.status).not.toBe('Accepted');
    });
  });

  describe('TransactionEvent lifecycle', () => {
    it('runs Started -> Updated -> Ended and bills the register delta', async () => {
      ocppClient = await createClient(TEST_CHARGE_POINT_ID, ['ocpp2.0.1']);
      await sendBootNotification(ocppClient);

      const idToken = await idTagService.issueIdTag(TEST_USER_ID);
      const transactionId = `tx-${RUN_SUFFIX}`;
      const startedAt = new Date();

      const startResponse = (await ocppClient.call('TransactionEvent', {
        eventType: 'Started',
        timestamp: startedAt.toISOString(),
        triggerReason: 'Authorized',
        seqNo: 0,
        transactionInfo: { transactionId },
        idToken: { idToken, type: 'Central' },
        evse: { id: TEST_EVSE_ID, connectorId: 1 },
        meterValue: [
          {
            timestamp: startedAt.toISOString(),
            sampledValue: [
              {
                value: 1000,
                context: 'Transaction.Begin',
                measurand: 'Energy.Active.Import.Register',
              },
            ],
          },
        ],
      })) as Ocpp2TransactionEventResponse;
      expect(startResponse.idTokenInfo?.status).toBe('Accepted');

      const activeSession = await prismaService.session.findFirst({
        where: { connectorId: TEST_CONNECTOR_ID, userId: TEST_USER_ID, status: 'ACTIVE' },
      });
      expect(activeSession).not.toBeNull();

      await ocppClient.call('TransactionEvent', {
        eventType: 'Updated',
        timestamp: new Date(startedAt.getTime() + 60_000).toISOString(),
        triggerReason: 'MeterValuePeriodic',
        seqNo: 1,
        transactionInfo: { transactionId, chargingState: 'Charging' },
        meterValue: [
          {
            timestamp: new Date(startedAt.getTime() + 60_000).toISOString(),
            sampledValue: [
              {
                value: 3500,
                context: 'Sample.Periodic',
                measurand: 'Energy.Active.Import.Register',
              },
            ],
          },
        ],
      });

      await ocppClient.call('TransactionEvent', {
        eventType: 'Ended',
        timestamp: new Date(startedAt.getTime() + 120_000).toISOString(),
        triggerReason: 'EVDeparted',
        seqNo: 2,
        transactionInfo: { transactionId, stoppedReason: 'EVDisconnected' },
        meterValue: [
          {
            timestamp: new Date(startedAt.getTime() + 120_000).toISOString(),
            sampledValue: [
              {
                value: 6000,
                context: 'Transaction.End',
                measurand: 'Energy.Active.Import.Register',
              },
            ],
          },
        ],
      });

      const completedSession = await prismaService.session.findFirst({
        where: { connectorId: TEST_CONNECTOR_ID, userId: TEST_USER_ID },
        orderBy: { createdAt: 'desc' },
      });
      expect(completedSession?.status).toBe('COMPLETED');
      // 6000 Wh - 1000 Wh = 5 kWh billed from the register delta.
      expect(completedSession?.energyDelivered).toBeCloseTo(5);
      expect(completedSession?.totalCost).toBeGreaterThan(0);
    });
  });

  describe('RequestStartTransaction', () => {
    it('dispatches the 2.0.1 remote start command shape to a 2.0.1 client', async () => {
      ocppClient = await createClient(TEST_CHARGE_POINT_ID, ['ocpp2.0.1']);
      await sendBootNotification(ocppClient);

      let receivedPayload: unknown = null;
      ocppClient.handle('RequestStartTransaction', (options: { params?: unknown }) => {
        receivedPayload = options.params;
        return Promise.resolve({ status: 'Accepted' });
      });

      const issuedIdTag = await idTagService.issueIdTag(TEST_USER_ID);
      const result = await remoteStartService.remoteStartTransaction({
        chargePointId: TEST_CHARGE_POINT_ID,
        payload: {
          connectorId: TEST_EVSE_ID,
          idTag: issuedIdTag,
        },
      });

      expect(result.status).toBe('Accepted');
      expect(receivedPayload).toEqual(
        expect.objectContaining({
          evseId: TEST_EVSE_ID,
          idToken: { idToken: issuedIdTag, type: 'Central' },
        }),
      );
    });
  });

  describe('Protocol coexistence', () => {
    it('serves a 1.6 and a 2.0.1 charge point simultaneously', async () => {
      ocppClient = await createClient(TEST_CHARGE_POINT_ID, ['ocpp2.0.1']);
      legacyClient = await createClient(TEST_LEGACY_CHARGE_POINT_ID, ['ocpp1.6']);

      const modernBoot = await sendBootNotification(ocppClient);
      const legacyBoot = (await legacyClient.call('BootNotification', {
        chargePointVendor: 'ABB',
        chargePointModel: 'Terra 54',
      })) as { status: string };

      expect(modernBoot.status).toBe('Accepted');
      expect(legacyBoot.status).toBe('Accepted');
      expect(registryService.getChargePoint(TEST_CHARGE_POINT_ID)).toBeDefined();
      expect(registryService.getChargePoint(TEST_LEGACY_CHARGE_POINT_ID)).toBeDefined();
    });
  });
});
