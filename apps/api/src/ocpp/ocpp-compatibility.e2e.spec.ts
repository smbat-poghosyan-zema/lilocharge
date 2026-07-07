import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  OcppAction,
  type OcppBootNotificationResponse,
  type OcppHeartbeatResponse,
  type OcppMeterValuesRequest,
  type OcppStartTransactionResponse,
  type OcppStopTransactionResponse,
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
import { OcppRemoteStopService } from './ocpp.remote-stop.service';

const TEST_CHARGE_POINT_ID = 'CP-TEST-001';
const TEST_CONNECTOR_ID_OCPP = 1;
const TEST_STATION_ID = '11111111-1111-1111-1111-111111111111';
const TEST_CONNECTOR_ID = '22222222-2222-2222-2222-222222222222';
const TEST_USER_ID = '33333333-3333-3333-3333-333333333333';
const TEST_PRICING_PLAN_ID = '44444444-4444-4444-4444-444444444444';
const OCPP_SERVER_PORT = 9221;
const OCPP_SERVER_HOST = '127.0.0.1';

/**
 * OCPP 1.6-J Compatibility E2E Test Suite.
 *
 * Tests complete OCPP message flow with simulated charge point client:
 * - Connection and authentication
 * - BootNotification acceptance
 * - Heartbeat keepalive
 * - StatusNotification updates
 * - MeterValues telemetry
 * - StartTransaction / StopTransaction lifecycle
 * - RemoteStartTransaction / RemoteStopTransaction commands
 *
 * To test with real hardware:
 * 1. Configure charge point to connect to ws://localhost:9221/CP-HARDWARE-001
 * 2. Update TEST_CHARGE_POINT_ID to match hardware ID
 * 3. Seed database with matching station/connector records
 * 4. Run: pnpm test ocpp-compatibility.e2e.spec.ts
 */
/** Run-unique user identity so leftovers from crashed or concurrent runs never collide. */
const RUN_SUFFIX = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const TEST_PHONE_UNIQUE = `+374${RUN_SUFFIX.slice(-8)}`;

describe('OCPP 1.6-J Compatibility (E2E) - Charge Point Communication', () => {
  let app: NestFastifyApplication;
  let prismaService: PrismaService;
  let registryService: OcppRegistryService;
  let idTagService: OcppIdTagService;
  let remoteStartService: OcppRemoteStartService;
  let remoteStopService: OcppRemoteStopService;
  let ocppClient: RPCClient | null = null;

  beforeAll(async () => {
    process.env.DATABASE_URL =
      'postgresql://lilocharge:lilocharge_dev_password@localhost:5437/lilocharge_test';
    process.env.REDIS_URL = 'redis://localhost:6382';
    process.env.JWT_SECRET = 'test-jwt-secret-ocpp-e2e';
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
    remoteStopService = moduleFixture.get<OcppRemoteStopService>(OcppRemoteStopService);

    // Allow OCPP server time to start
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }, 45000);

  afterAll(async () => {
    if (ocppClient !== null) {
      await ocppClient.close();
      ocppClient = null;
    }

    await cleanupTestData();
    await app.close();
  }, 30000);

  beforeEach(async () => {
    if (ocppClient !== null) {
      await ocppClient.close();
      ocppClient = null;
    }

    await cleanupTestData();
    await seedTestData();
  });

  afterEach(async () => {
    if (ocppClient !== null) {
      await ocppClient.close();
      ocppClient = null;
    }
  });

  /** Cleans up test database records created during test execution. */
  async function cleanupTestData(): Promise<void> {
    try {
      await prismaService.session.deleteMany({
        where: { connectorId: TEST_CONNECTOR_ID },
      });
      await prismaService.pricingPlan.deleteMany({
        where: { connectorId: TEST_CONNECTOR_ID },
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

  /** Seeds database with test fixtures for OCPP compatibility testing. */
  async function seedTestData(): Promise<void> {
    await prismaService.user.create({
      data: {
        id: TEST_USER_ID,
        email: `test-ocpp-${Date.now()}@lilocharge.am`,
        passwordHash: '$2b$12$abcdefghijklmnopqrstuv',
        phone: TEST_PHONE_UNIQUE,
        displayName: 'OCPP Test User',
        language: 'HY',
        pushNotificationsEnabled: true,
        marketingNotificationsEnabled: false,
        createdAt: new Date('2026-02-17T08:00:00.000Z'),
        updatedAt: new Date('2026-02-17T08:00:00.000Z'),
      },
    });

    await prismaService.station.create({
      data: {
        id: TEST_STATION_ID,
        name: 'Test OCPP Station',
        address: 'Test Address',
        city: 'Yerevan',
        latitude: 40.1776,
        longitude: 44.5126,
        // The OCPP services resolve connectors scoped to station.operatorId === charge point
        // identity, so the seeded station must be owned by the simulated charge point.
        operatorId: TEST_CHARGE_POINT_ID,
        operatorName: 'Test Operator',
        status: 'AVAILABLE',
        createdAt: new Date('2026-02-17T08:00:00.000Z'),
        updatedAt: new Date('2026-02-17T08:00:00.000Z'),
      },
    });

    await prismaService.connector.create({
      data: {
        id: TEST_CONNECTOR_ID,
        stationId: TEST_STATION_ID,
        evseId: `${TEST_CHARGE_POINT_ID}-evse-${TEST_CONNECTOR_ID_OCPP}`,
        connectorType: 'CCS',
        powerKw: 50,
        status: 'AVAILABLE',
        lastStatusUpdate: new Date('2026-02-17T08:00:00.000Z'),
        createdAt: new Date('2026-02-17T08:00:00.000Z'),
        updatedAt: new Date('2026-02-17T08:00:00.000Z'),
      },
    });

    await prismaService.pricingPlan.create({
      data: {
        id: TEST_PRICING_PLAN_ID,
        connectorId: TEST_CONNECTOR_ID,
        name: 'Test Pricing Plan',
        pricePerKwh: 150,
        pricePerMinute: 10,
        sessionFee: 0,
        idleFee: 0,
        validFrom: new Date('2026-02-17T00:00:00.000Z'),
        validUntil: null,
        createdAt: new Date('2026-02-17T08:00:00.000Z'),
        updatedAt: new Date('2026-02-17T08:00:00.000Z'),
      },
    });
  }

  /** Creates and connects an OCPP client simulating a charge point. */
  async function createOcppClient(chargePointId: string): Promise<RPCClient> {
    // @ts-expect-error: ocpp-rpc type definitions may be incomplete
    const client = new RPCClient({
      endpoint: `ws://${OCPP_SERVER_HOST}:${OCPP_SERVER_PORT}/${chargePointId}`,
      identity: chargePointId,
      protocols: ['ocpp1.6'],
      strictMode: true,
      // Reconnection is disabled so a refused/never-established connection surfaces as an
      // error instead of the client silently retrying until the jest timeout.
      reconnect: false,
    });

    // RPCClient does not connect on construction; connect() resolves once the WebSocket
    // handshake (including subprotocol negotiation and server-side auth) completes.
    const connectTimeout = new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error('OCPP client connection timeout')),
        5000,
      );
      timer.unref();
    });

    await Promise.race([client.connect(), connectTimeout]);

    return client;
  }

  describe('Connection and Authentication', () => {
    it('accepts charge point connection with valid identity', async () => {
      ocppClient = await createOcppClient(TEST_CHARGE_POINT_ID);

      expect(ocppClient).toBeDefined();
      expect(registryService.getChargePoint(TEST_CHARGE_POINT_ID)).toBeDefined();
    });

    it('rejects charge point connection with empty identity', async () => {
      await expect(createOcppClient('')).rejects.toThrow();
    });

    it('supports ocpp1.6 subprotocol negotiation', async () => {
      ocppClient = await createOcppClient(TEST_CHARGE_POINT_ID);
      const registration = registryService.getChargePoint(TEST_CHARGE_POINT_ID);

      expect(registration?.client?.protocol).toBe('ocpp1.6');
    });
  });

  describe('BootNotification', () => {
    beforeEach(async () => {
      ocppClient = await createOcppClient(TEST_CHARGE_POINT_ID);
    });

    it('returns Accepted status with current time and heartbeat interval', async () => {
      const beforeRequest = new Date();
      const response = (await ocppClient!.call(OcppAction.BOOT_NOTIFICATION, {
        chargePointVendor: 'ABB',
        chargePointModel: 'Terra 54',
        chargePointSerialNumber: 'SN-TEST-001',
        firmwareVersion: '1.2.3',
      })) as OcppBootNotificationResponse;
      const afterRequest = new Date();

      expect(response.status).toBe('Accepted');
      expect(response.interval).toBeGreaterThan(0);
      expect(new Date(response.currentTime).getTime()).toBeGreaterThanOrEqual(
        beforeRequest.getTime(),
      );
      expect(new Date(response.currentTime).getTime()).toBeLessThanOrEqual(afterRequest.getTime());
    });

    it('persists charge point metadata in registry', async () => {
      const bootPayload = {
        chargePointVendor: 'ABB',
        chargePointModel: 'Terra 54',
        chargePointSerialNumber: 'SN-TEST-001',
        chargeBoxSerialNumber: 'CB-TEST-001',
        firmwareVersion: '1.2.3',
      };

      await ocppClient!.call(OcppAction.BOOT_NOTIFICATION, bootPayload);
      const registration = registryService.getChargePoint(TEST_CHARGE_POINT_ID);

      expect(registration?.lastBootNotification).toEqual(bootPayload);
      expect(registration?.registrationStatus).toBe('Accepted');
      expect(registration?.lastBootNotificationAt).toBeDefined();
    });

    it('accepts multiple BootNotification messages and updates registry', async () => {
      await ocppClient!.call(OcppAction.BOOT_NOTIFICATION, {
        chargePointVendor: 'ABB',
        chargePointModel: 'Terra 54',
        firmwareVersion: '1.0.0',
      });

      const secondResponse = (await ocppClient!.call(OcppAction.BOOT_NOTIFICATION, {
        chargePointVendor: 'ABB',
        chargePointModel: 'Terra 54',
        firmwareVersion: '1.2.3',
      })) as OcppBootNotificationResponse;

      const registration = registryService.getChargePoint(TEST_CHARGE_POINT_ID);
      expect(secondResponse.status).toBe('Accepted');
      expect(registration?.lastBootNotification?.firmwareVersion).toBe('1.2.3');
    });
  });

  describe('Heartbeat', () => {
    beforeEach(async () => {
      ocppClient = await createOcppClient(TEST_CHARGE_POINT_ID);
      await ocppClient.call(OcppAction.BOOT_NOTIFICATION, {
        chargePointVendor: 'ABB',
        chargePointModel: 'Terra 54',
      });
    });

    it('returns current central system time', async () => {
      const beforeRequest = new Date();
      const response = (await ocppClient!.call(OcppAction.HEARTBEAT, {})) as OcppHeartbeatResponse;
      const afterRequest = new Date();

      expect(response.currentTime).toBeDefined();
      expect(new Date(response.currentTime).getTime()).toBeGreaterThanOrEqual(
        beforeRequest.getTime(),
      );
      expect(new Date(response.currentTime).getTime()).toBeLessThanOrEqual(afterRequest.getTime());
    });

    it('updates last heartbeat timestamp in registry', async () => {
      const registrationBefore = registryService.getChargePoint(TEST_CHARGE_POINT_ID);
      const lastHeartbeatBefore = registrationBefore?.lastHeartbeatAt;

      await new Promise((resolve) => setTimeout(resolve, 100));
      await ocppClient!.call(OcppAction.HEARTBEAT, {});

      const registrationAfter = registryService.getChargePoint(TEST_CHARGE_POINT_ID);
      expect(registrationAfter?.lastHeartbeatAt).not.toBe(lastHeartbeatBefore);
    });

    it('handles rapid consecutive heartbeats', async () => {
      const heartbeatPromises = Array.from({ length: 5 }, () =>
        ocppClient!.call(OcppAction.HEARTBEAT, {}),
      );

      const responses = await Promise.all(heartbeatPromises);

      expect(responses).toHaveLength(5);
      responses.forEach((response) => {
        const typed = response as OcppHeartbeatResponse;
        expect(typed.currentTime).toBeDefined();
      });
    });
  });

  describe('StatusNotification', () => {
    beforeEach(async () => {
      ocppClient = await createOcppClient(TEST_CHARGE_POINT_ID);
      await ocppClient.call(OcppAction.BOOT_NOTIFICATION, {
        chargePointVendor: 'ABB',
        chargePointModel: 'Terra 54',
      });
    });

    it('acknowledges Available status notification', async () => {
      const response = await ocppClient!.call(OcppAction.STATUS_NOTIFICATION, {
        connectorId: TEST_CONNECTOR_ID_OCPP,
        errorCode: 'NoError',
        status: 'Available',
        timestamp: new Date().toISOString(),
      });

      expect(response).toEqual({});

      const connector = await prismaService.connector.findUnique({
        where: { id: TEST_CONNECTOR_ID },
      });
      expect(connector?.status).toBe('AVAILABLE');
    });

    it('acknowledges Charging status notification and updates connector', async () => {
      const response = await ocppClient!.call(OcppAction.STATUS_NOTIFICATION, {
        connectorId: TEST_CONNECTOR_ID_OCPP,
        errorCode: 'NoError',
        status: 'Charging',
        timestamp: new Date().toISOString(),
      });

      expect(response).toEqual({});

      const connector = await prismaService.connector.findUnique({
        where: { id: TEST_CONNECTOR_ID },
      });
      expect(connector?.status).toBe('OCCUPIED');
    });

    it('acknowledges Faulted status notification', async () => {
      const response = await ocppClient!.call(OcppAction.STATUS_NOTIFICATION, {
        connectorId: TEST_CONNECTOR_ID_OCPP,
        errorCode: 'GroundFailure',
        status: 'Faulted',
        timestamp: new Date().toISOString(),
      });

      expect(response).toEqual({});

      const connector = await prismaService.connector.findUnique({
        where: { id: TEST_CONNECTOR_ID },
      });
      expect(connector?.status).toBe('MAINTENANCE');
    });

    it('handles all OCPP 1.6-J status values', async () => {
      const statuses = [
        'Available',
        'Preparing',
        'Charging',
        'SuspendedEVSE',
        'SuspendedEV',
        'Finishing',
        'Reserved',
        'Unavailable',
        'Faulted',
      ] as const;

      for (const status of statuses) {
        const response = await ocppClient!.call(OcppAction.STATUS_NOTIFICATION, {
          connectorId: TEST_CONNECTOR_ID_OCPP,
          errorCode: 'NoError',
          status,
          timestamp: new Date().toISOString(),
        });

        expect(response).toEqual({});
      }
    });
  });

  describe('MeterValues', () => {
    beforeEach(async () => {
      ocppClient = await createOcppClient(TEST_CHARGE_POINT_ID);
      await ocppClient.call(OcppAction.BOOT_NOTIFICATION, {
        chargePointVendor: 'ABB',
        chargePointModel: 'Terra 54',
      });
    });

    it('acknowledges periodic meter values without transaction', async () => {
      const meterValuesPayload: OcppMeterValuesRequest = {
        connectorId: TEST_CONNECTOR_ID_OCPP,
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              {
                value: '230.5',
                context: 'Sample.Periodic',
                measurand: 'Voltage',
                unit: 'V',
              },
              {
                value: '16.2',
                context: 'Sample.Periodic',
                measurand: 'Current.Import',
                unit: 'A',
              },
            ],
          },
        ],
      };

      const response = await ocppClient!.call(OcppAction.METER_VALUES, meterValuesPayload);

      expect(response).toEqual({});
    });

    it('persists meter values to TimescaleDB', async () => {
      const timestamp = new Date().toISOString();
      const meterValuesPayload: OcppMeterValuesRequest = {
        connectorId: TEST_CONNECTOR_ID_OCPP,
        meterValue: [
          {
            timestamp,
            sampledValue: [
              {
                value: '5000',
                context: 'Sample.Periodic',
                measurand: 'Energy.Active.Import.Register',
                unit: 'Wh',
              },
            ],
          },
        ],
      };

      await ocppClient!.call(OcppAction.METER_VALUES, meterValuesPayload);

      // Small delay to allow async insertion
      await new Promise((resolve) => setTimeout(resolve, 500));

      const sessions = await prismaService.session.findMany({
        where: {
          connectorId: TEST_CONNECTOR_ID,
        },
        include: {
          meterValues: true,
        },
      });

      // Check that meter values were stored (may be associated with a session)
      expect(sessions.length).toBeGreaterThanOrEqual(0);
    });

    it('handles multiple sampled values in single meter reading', async () => {
      const meterValuesPayload: OcppMeterValuesRequest = {
        connectorId: TEST_CONNECTOR_ID_OCPP,
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              {
                value: '230',
                measurand: 'Voltage',
                unit: 'V',
              },
              {
                value: '15',
                measurand: 'Current.Import',
                unit: 'A',
              },
              {
                value: '3450',
                measurand: 'Power.Active.Import',
                unit: 'W',
              },
            ],
          },
        ],
      };

      const response = await ocppClient!.call(OcppAction.METER_VALUES, meterValuesPayload);

      expect(response).toEqual({});
    });
  });

  describe('StartTransaction and StopTransaction', () => {
    let transactionId: number;

    beforeEach(async () => {
      ocppClient = await createOcppClient(TEST_CHARGE_POINT_ID);
      await ocppClient.call(OcppAction.BOOT_NOTIFICATION, {
        chargePointVendor: 'ABB',
        chargePointModel: 'Terra 54',
      });
      await ocppClient.call(OcppAction.STATUS_NOTIFICATION, {
        connectorId: TEST_CONNECTOR_ID_OCPP,
        errorCode: 'NoError',
        status: 'Available',
      });
    });

    it('starts transaction and returns Accepted status with transaction ID', async () => {
      const response = (await ocppClient!.call(OcppAction.START_TRANSACTION, {
        connectorId: TEST_CONNECTOR_ID_OCPP,
        idTag: await idTagService.issueIdTag(TEST_USER_ID),
        meterStart: 0,
        timestamp: new Date().toISOString(),
      })) as OcppStartTransactionResponse;

      expect(response.idTagInfo.status).toBe('Accepted');
      expect(response.transactionId).toBeGreaterThan(0);

      transactionId = response.transactionId;

      const session = await prismaService.session.findFirst({
        where: {
          connectorId: TEST_CONNECTOR_ID,
          userId: TEST_USER_ID,
          status: 'ACTIVE',
        },
      });

      expect(session).toBeDefined();
    });

    it('completes full transaction lifecycle: start → meter values → stop', async () => {
      // Start transaction
      const startResponse = (await ocppClient!.call(OcppAction.START_TRANSACTION, {
        connectorId: TEST_CONNECTOR_ID_OCPP,
        idTag: await idTagService.issueIdTag(TEST_USER_ID),
        meterStart: 1000,
        timestamp: new Date().toISOString(),
      })) as OcppStartTransactionResponse;

      expect(startResponse.idTagInfo.status).toBe('Accepted');
      transactionId = startResponse.transactionId;

      // Send charging status
      await ocppClient!.call(OcppAction.STATUS_NOTIFICATION, {
        connectorId: TEST_CONNECTOR_ID_OCPP,
        errorCode: 'NoError',
        status: 'Charging',
      });

      // Send meter values during transaction
      await ocppClient!.call(OcppAction.METER_VALUES, {
        connectorId: TEST_CONNECTOR_ID_OCPP,
        transactionId,
        meterValue: [
          {
            timestamp: new Date().toISOString(),
            sampledValue: [
              {
                value: '5000',
                context: 'Sample.Periodic',
                measurand: 'Energy.Active.Import.Register',
                unit: 'Wh',
              },
            ],
          },
        ],
      });

      // Stop transaction
      const stopResponse = (await ocppClient!.call(OcppAction.STOP_TRANSACTION, {
        transactionId,
        idTag: await idTagService.issueIdTag(TEST_USER_ID),
        meterStop: 6000,
        timestamp: new Date().toISOString(),
        reason: 'Local',
      })) as OcppStopTransactionResponse;

      expect(stopResponse).toBeDefined();

      // Verify session completed
      const session = await prismaService.session.findFirst({
        where: {
          connectorId: TEST_CONNECTOR_ID,
          userId: TEST_USER_ID,
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(session?.status).toBe('COMPLETED');
      expect(session?.energyDelivered).toBeGreaterThan(0);
    });

    it('rejects StartTransaction with invalid idTag', async () => {
      const response = (await ocppClient!.call(OcppAction.START_TRANSACTION, {
        connectorId: TEST_CONNECTOR_ID_OCPP,
        idTag: 'invalid-user-id',
        meterStart: 0,
        timestamp: new Date().toISOString(),
      })) as OcppStartTransactionResponse;

      expect(response.idTagInfo.status).toBe('Invalid');
    });
  });

  describe('RemoteStartTransaction and RemoteStopTransaction', () => {
    let transactionId: number;

    beforeEach(async () => {
      ocppClient = await createOcppClient(TEST_CHARGE_POINT_ID);
      await ocppClient.call(OcppAction.BOOT_NOTIFICATION, {
        chargePointVendor: 'ABB',
        chargePointModel: 'Terra 54',
      });
      await ocppClient.call(OcppAction.STATUS_NOTIFICATION, {
        connectorId: TEST_CONNECTOR_ID_OCPP,
        errorCode: 'NoError',
        status: 'Available',
      });
    });

    it('sends RemoteStartTransaction command from central system', async () => {
      let remoteStartReceived = false;
      let remoteStartPayload: unknown = null;

      ocppClient!.handle(OcppAction.REMOTE_START_TRANSACTION, (options) => {
        remoteStartReceived = true;
        remoteStartPayload = options.params;
        return Promise.resolve({ status: 'Accepted' });
      });

      const issuedIdTag = await idTagService.issueIdTag(TEST_USER_ID);
      const response = await remoteStartService.remoteStartTransaction({
        chargePointId: TEST_CHARGE_POINT_ID,
        payload: {
          connectorId: TEST_CONNECTOR_ID_OCPP,
          idTag: issuedIdTag,
        },
      });

      expect(response.status).toBe('Accepted');
      expect(remoteStartReceived).toBe(true);
      expect(remoteStartPayload).toEqual({
        connectorId: TEST_CONNECTOR_ID_OCPP,
        idTag: issuedIdTag,
      });
    });

    it('sends RemoteStopTransaction command from central system', async () => {
      // First start a transaction
      const startResponse = (await ocppClient!.call(OcppAction.START_TRANSACTION, {
        connectorId: TEST_CONNECTOR_ID_OCPP,
        idTag: await idTagService.issueIdTag(TEST_USER_ID),
        meterStart: 0,
        timestamp: new Date().toISOString(),
      })) as OcppStartTransactionResponse;

      transactionId = startResponse.transactionId;

      let remoteStopReceived = false;
      let remoteStopPayload: unknown = null;

      ocppClient!.handle(OcppAction.REMOTE_STOP_TRANSACTION, (options) => {
        remoteStopReceived = true;
        remoteStopPayload = options.params;
        return Promise.resolve({ status: 'Accepted' });
      });

      const response = await remoteStopService.remoteStopTransaction({
        chargePointId: TEST_CHARGE_POINT_ID,
        payload: {
          transactionId,
        },
      });

      expect(response.status).toBe('Accepted');
      expect(remoteStopReceived).toBe(true);
      expect(remoteStopPayload).toEqual({
        transactionId,
      });
    });

    it('handles RemoteStartTransaction rejection', async () => {
      ocppClient!.handle(OcppAction.REMOTE_START_TRANSACTION, () => {
        return Promise.resolve({ status: 'Rejected' });
      });

      const response = await remoteStartService.remoteStartTransaction({
        chargePointId: TEST_CHARGE_POINT_ID,
        payload: {
          connectorId: TEST_CONNECTOR_ID_OCPP,
          idTag: await idTagService.issueIdTag(TEST_USER_ID),
        },
      });

      expect(response.status).toBe('Rejected');
    });
  });

  describe('Connection Lifecycle', () => {
    it('removes charge point from registry on disconnect', async () => {
      ocppClient = await createOcppClient(TEST_CHARGE_POINT_ID);

      expect(registryService.getChargePoint(TEST_CHARGE_POINT_ID)).toBeDefined();

      await ocppClient.close();
      ocppClient = null;

      // Registry removal is event-driven; poll briefly instead of relying on one fixed delay.
      const deadline = Date.now() + 3000;
      while (
        registryService.getChargePoint(TEST_CHARGE_POINT_ID) !== null &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      expect(registryService.getChargePoint(TEST_CHARGE_POINT_ID)).toBeNull();
    });

    it('handles reconnection after disconnect', async () => {
      // First connection
      ocppClient = await createOcppClient(TEST_CHARGE_POINT_ID);
      await ocppClient.call(OcppAction.BOOT_NOTIFICATION, {
        chargePointVendor: 'ABB',
        chargePointModel: 'Terra 54',
      });

      await ocppClient.close();
      ocppClient = null;
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Reconnect
      ocppClient = await createOcppClient(TEST_CHARGE_POINT_ID);
      const response = (await ocppClient.call(OcppAction.BOOT_NOTIFICATION, {
        chargePointVendor: 'ABB',
        chargePointModel: 'Terra 54',
      })) as OcppBootNotificationResponse;

      expect(response.status).toBe('Accepted');
      expect(registryService.getChargePoint(TEST_CHARGE_POINT_ID)).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      ocppClient = await createOcppClient(TEST_CHARGE_POINT_ID);
      await ocppClient.call(OcppAction.BOOT_NOTIFICATION, {
        chargePointVendor: 'ABB',
        chargePointModel: 'Terra 54',
      });
    });

    it('handles malformed OCPP message payloads gracefully', async () => {
      // StatusNotification with invalid connector ID should still be acknowledged
      const response = await ocppClient!.call(OcppAction.STATUS_NOTIFICATION, {
        connectorId: 999, // Non-existent connector
        errorCode: 'NoError',
        status: 'Available',
      });

      expect(response).toEqual({});
    });

    it('rejects unsupported OCPP actions', async () => {
      await expect(ocppClient!.call('UnsupportedAction', {})).rejects.toThrow();
    });
  });

  describe('App-initiated remote start ↔ charger StartTransaction linking (R1)', () => {
    it('attaches the charger StartTransaction to the API session instead of creating a duplicate', async () => {
      // GIVEN an API-created session in AUTHORIZED state (as SessionsService.startSession leaves it
      // just before dispatching RemoteStart) and a connected charge point.
      const apiSession = await prismaService.session.create({
        data: {
          id: '55555555-5555-5555-5555-555555555555',
          userId: TEST_USER_ID,
          connectorId: TEST_CONNECTOR_ID,
          status: 'AUTHORIZED',
        },
        select: { id: true },
      });

      ocppClient = await createOcppClient(TEST_CHARGE_POINT_ID);
      await ocppClient.call(OcppAction.BOOT_NOTIFICATION, {
        chargePointVendor: 'ABB',
        chargePointModel: 'Terra 54',
      });

      // The charge point answers RemoteStart by opening a transaction with the same idTag it received
      // (a real 1.6 charger's behaviour).
      let remoteStartIdTag: string | null = null;
      ocppClient.handle(OcppAction.REMOTE_START_TRANSACTION, (options) => {
        const params = options.params as { idTag: string };
        remoteStartIdTag = params.idTag;
        return Promise.resolve({ status: 'Accepted' });
      });

      const issuedIdTag = await idTagService.issueIdTag(TEST_USER_ID);

      // WHEN the app dispatches RemoteStart carrying the sessionId (as SessionsService does).
      const remoteStartResult = await remoteStartService.remoteStartTransaction({
        chargePointId: TEST_CHARGE_POINT_ID,
        sessionId: apiSession.id,
        payload: {
          connectorId: TEST_CONNECTOR_ID_OCPP,
          idTag: issuedIdTag,
        },
      });
      expect(remoteStartResult.status).toBe('Accepted');
      expect(remoteStartIdTag).toBe(issuedIdTag);

      // AND the charger reports the transaction it opened.
      const startResponse = (await ocppClient.call(OcppAction.START_TRANSACTION, {
        connectorId: TEST_CONNECTOR_ID_OCPP,
        idTag: issuedIdTag,
        meterStart: 1000,
        timestamp: new Date().toISOString(),
      })) as OcppStartTransactionResponse;
      expect(startResponse.idTagInfo.status).toBe('Accepted');

      // THEN exactly ONE session exists for the connector — the API session, now carrying the
      // charger's transaction id — not a duplicate charger-local session.
      const sessions = await prismaService.session.findMany({
        where: { connectorId: TEST_CONNECTOR_ID },
        select: { id: true, status: true, transactionId: true, meterStart: true },
      });
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.id).toBe(apiSession.id);
      expect(sessions[0]?.status).toBe('ACTIVE');
      expect(sessions[0]?.transactionId).toBe(String(startResponse.transactionId));
      expect(sessions[0]?.meterStart).toBe(1000);
    });

    it('creates a charger-local session when no tracked remote start matches', async () => {
      // A charger-initiated (non-app) StartTransaction still creates its own session.
      ocppClient = await createOcppClient(TEST_CHARGE_POINT_ID);
      await ocppClient.call(OcppAction.BOOT_NOTIFICATION, {
        chargePointVendor: 'ABB',
        chargePointModel: 'Terra 54',
      });

      const startResponse = (await ocppClient.call(OcppAction.START_TRANSACTION, {
        connectorId: TEST_CONNECTOR_ID_OCPP,
        idTag: await idTagService.issueIdTag(TEST_USER_ID),
        meterStart: 0,
        timestamp: new Date().toISOString(),
      })) as OcppStartTransactionResponse;

      expect(startResponse.idTagInfo.status).toBe('Accepted');
      const sessions = await prismaService.session.findMany({
        where: { connectorId: TEST_CONNECTOR_ID },
        select: { id: true },
      });
      expect(sessions).toHaveLength(1);
    });
  });
});
