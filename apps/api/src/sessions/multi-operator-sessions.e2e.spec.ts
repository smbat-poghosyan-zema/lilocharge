import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SessionStatus as SharedSessionStatus } from '@lilocharge/shared-types';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from './sessions.service';

const TEST_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEST_VEHICLE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// EV Armenia operator
const EV_ARMENIA_STATION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const EV_ARMENIA_CONNECTOR_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const EV_ARMENIA_PRICING_PLAN_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// iCharge operator
const ICHARGE_STATION_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const ICHARGE_CONNECTOR_ID = '10101010-1010-1010-1010-101010101010';
const ICHARGE_PRICING_PLAN_ID = '11111111-1111-1111-1111-111111111111';

// EVAN operator
const EVAN_STATION_ID = '12121212-1212-1212-1212-121212121212';
const EVAN_CONNECTOR_ID = '13131313-1313-1313-1313-131313131313';
const EVAN_PRICING_PLAN_ID = '14141414-1414-1414-1414-141414141414';

/**
 * E2E test suite for multi-operator session simulation.
 * Tests the complete flow of charging sessions across 3+ different operators in sequence.
 */
describe('Multi-Operator Sessions (E2E) - Session Lifecycle Across Different Operators', () => {
  let app: NestFastifyApplication;
  let prismaService: PrismaService;
  let sessionsService: SessionsService;

  beforeAll(async () => {
    process.env.DATABASE_URL =
      'postgresql://lilocharge:lilocharge_dev_password@localhost:5437/lilocharge_test';
    process.env.REDIS_URL = 'redis://localhost:6382';
    process.env.JWT_SECRET = 'test-jwt-secret-multi-operator';
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

    prismaService = moduleFixture.get<PrismaService>(PrismaService);
    sessionsService = moduleFixture.get<SessionsService>(SessionsService);
  }, 30000);

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData();
    await seedTestData();
  });

  /** Cleans up all test data created for multi-operator tests. */
  async function cleanupTestData(): Promise<void> {
    try {
      // Delete payments first (they reference sessions)
      await prismaService.payment.deleteMany({
        where: { userId: TEST_USER_ID },
      });

      // Delete wallet transactions
      await prismaService.walletTransaction.deleteMany({
        where: {
          wallet: {
            userId: TEST_USER_ID,
          },
        },
      });

      // Delete sessions
      await prismaService.session.deleteMany({
        where: { userId: TEST_USER_ID },
      });

      // Delete wallet
      await prismaService.wallet.deleteMany({
        where: { userId: TEST_USER_ID },
      });

      // Delete payment methods
      await prismaService.paymentMethod.deleteMany({
        where: { userId: TEST_USER_ID },
      });

      // Delete pricing plans
      await prismaService.pricingPlan.deleteMany({
        where: {
          id: {
            in: [EV_ARMENIA_PRICING_PLAN_ID, ICHARGE_PRICING_PLAN_ID, EVAN_PRICING_PLAN_ID],
          },
        },
      });

      // Delete connectors
      await prismaService.connector.deleteMany({
        where: {
          id: {
            in: [EV_ARMENIA_CONNECTOR_ID, ICHARGE_CONNECTOR_ID, EVAN_CONNECTOR_ID],
          },
        },
      });

      // Delete stations
      await prismaService.station.deleteMany({
        where: {
          id: {
            in: [EV_ARMENIA_STATION_ID, ICHARGE_STATION_ID, EVAN_STATION_ID],
          },
        },
      });

      // Delete vehicle
      await prismaService.vehicle.deleteMany({
        where: { id: TEST_VEHICLE_ID },
      });

      // Delete user
      await prismaService.user.deleteMany({
        where: { id: TEST_USER_ID },
      });
    } catch {
      // Ignore cleanup errors
    }
  }

  /** Seeds test data for multi-operator session tests. */
  async function seedTestData(): Promise<void> {
    // Create test user
    await prismaService.user.create({
      data: {
        id: TEST_USER_ID,
        email: 'multiop-test@lilocharge.am',
        phone: '+37477999888',
        displayName: 'Multi-Operator Test User',
        passwordHash: '$2b$12$test.hash.for.multi.operator.testing',
        language: 'HY',
      },
    });

    // Create test vehicle
    await prismaService.vehicle.create({
      data: {
        id: TEST_VEHICLE_ID,
        userId: TEST_USER_ID,
        make: 'Tesla',
        model: 'Model 3',
        year: 2024,
        connectorType: 'CCS',
        batteryCapacity: 75,
        maxChargePower: 250,
      },
    });

    // Create payment method (using WALLET to avoid external gateway dependencies in tests)
    await prismaService.paymentMethod.create({
      data: {
        id: randomUUID(),
        userId: TEST_USER_ID,
        gateway: 'WALLET',
        token: 'wallet-internal',
        isDefault: true,
      },
    });

    // Create wallet balance for user
    await prismaService.wallet.create({
      data: {
        id: randomUUID(),
        userId: TEST_USER_ID,
        balance: 5000000, // 50,000 AMD in cents - more than sufficient for all test sessions
      },
    });

    // Create EV Armenia station and connector
    await prismaService.station.create({
      data: {
        id: EV_ARMENIA_STATION_ID,
        operatorId: 'ev_armenia',
        operatorName: 'EV Armenia',
        name: 'EV Armenia Kentron Hub',
        address: 'Abovyan 10, Yerevan',
        city: 'Yerevan',
        latitude: 40.1792,
        longitude: 44.4991,
        status: 'AVAILABLE',
        openingHours: '24/7',
        amenities: ['parking', 'cafe'],
      },
    });

    await prismaService.connector.create({
      data: {
        id: EV_ARMENIA_CONNECTOR_ID,
        stationId: EV_ARMENIA_STATION_ID,
        evseId: 'EVA-KEN-001',
        connectorType: 'CCS',
        powerKw: 120,
        status: 'AVAILABLE',
      },
    });

    await prismaService.pricingPlan.create({
      data: {
        id: EV_ARMENIA_PRICING_PLAN_ID,
        connectorId: EV_ARMENIA_CONNECTOR_ID,
        name: 'EV Armenia DC Fast',
        pricePerKwh: 14000,
        pricePerMinute: null,
        sessionFee: 1000,
        idleFee: 500,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        validUntil: null,
      },
    });

    // Create iCharge station and connector
    await prismaService.station.create({
      data: {
        id: ICHARGE_STATION_ID,
        operatorId: 'icharge',
        operatorName: 'iCharge Armenia',
        name: 'iCharge Republic Square',
        address: 'Republic Square, Yerevan',
        city: 'Yerevan',
        latitude: 40.1777,
        longitude: 44.5126,
        status: 'AVAILABLE',
        openingHours: '06:00-22:00',
        amenities: ['parking'],
      },
    });

    await prismaService.connector.create({
      data: {
        id: ICHARGE_CONNECTOR_ID,
        stationId: ICHARGE_STATION_ID,
        evseId: 'ICH-REP-001',
        connectorType: 'CCS',
        powerKw: 150,
        status: 'AVAILABLE',
      },
    });

    await prismaService.pricingPlan.create({
      data: {
        id: ICHARGE_PRICING_PLAN_ID,
        connectorId: ICHARGE_CONNECTOR_ID,
        name: 'iCharge Premium',
        pricePerKwh: 15000,
        pricePerMinute: null,
        sessionFee: 1200,
        idleFee: 600,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        validUntil: null,
      },
    });

    // Create EVAN station and connector
    await prismaService.station.create({
      data: {
        id: EVAN_STATION_ID,
        operatorId: 'evan',
        operatorName: 'EVAN Charge',
        name: 'EVAN Cascade Shopping Center',
        address: 'Cascade Complex, Yerevan',
        city: 'Yerevan',
        latitude: 40.1888,
        longitude: 44.5158,
        status: 'AVAILABLE',
        openingHours: '24/7',
        amenities: ['parking', 'restaurant', 'wifi'],
      },
    });

    await prismaService.connector.create({
      data: {
        id: EVAN_CONNECTOR_ID,
        stationId: EVAN_STATION_ID,
        evseId: 'EVAN-CAS-001',
        connectorType: 'CCS',
        powerKw: 180,
        status: 'AVAILABLE',
      },
    });

    await prismaService.pricingPlan.create({
      data: {
        id: EVAN_PRICING_PLAN_ID,
        connectorId: EVAN_CONNECTOR_ID,
        name: 'EVAN Ultra Fast',
        pricePerKwh: 16000,
        pricePerMinute: null,
        sessionFee: 1500,
        idleFee: 700,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        validUntil: null,
      },
    });
  }

  /**
   * Helper function to create and complete a charging session at a specific connector.
   * @param connectorId - Connector ID to charge at
   * @param startTime - Session start time
   * @param endTime - Session end time
   * @param energyDelivered - Energy delivered in kWh
   * @returns Completed session response
   */
  async function createAndCompleteSession(input: {
    readonly connectorId: string;
    readonly startTime: Date;
    readonly endTime: Date;
    readonly energyDelivered: number;
  }): Promise<{ readonly id: string; readonly totalCost: number }> {
    // Create session
    const createdSession = await sessionsService.createSession(TEST_USER_ID, {
      connectorId: input.connectorId,
      vehicleId: TEST_VEHICLE_ID,
    });

    expect(createdSession.status).toBe(SharedSessionStatus.PENDING);

    // Start session
    const startedSession = await sessionsService.startSession(TEST_USER_ID, createdSession.id, {
      startedAt: input.startTime.toISOString(),
    });

    expect(startedSession.status).toBe(SharedSessionStatus.ACTIVE);
    expect(startedSession.startTime).toBe(input.startTime.toISOString());

    // Calculate expected cost
    const expectedCost = calculateSessionCost(input.connectorId, input.energyDelivered);

    // Update session with energy data and cost (simulating meter values)
    await prismaService.session.update({
      where: { id: startedSession.id },
      data: {
        energyDelivered: input.energyDelivered,
        peakPower: 120,
        totalCost: expectedCost,
      },
    });

    // Stop session
    const completedSession = await sessionsService.stopSession(TEST_USER_ID, startedSession.id, {
      endedAt: input.endTime.toISOString(),
    });

    expect(completedSession.status).toBe(SharedSessionStatus.COMPLETED);
    expect(completedSession.endTime).toBe(input.endTime.toISOString());
    expect(completedSession.totalCost).toBe(expectedCost);

    return {
      id: completedSession.id,
      totalCost: completedSession.totalCost,
    };
  }

  /**
   * Calculates session cost based on pricing plan.
   * @param connectorId - Connector ID
   * @param energyDelivered - Energy delivered in kWh
   * @returns Total cost in AMD cents
   */
  function calculateSessionCost(connectorId: string, energyDelivered: number): number {
    let pricePerKwh = 0;
    let sessionFee = 0;

    if (connectorId === EV_ARMENIA_CONNECTOR_ID) {
      pricePerKwh = 14000;
      sessionFee = 1000;
    } else if (connectorId === ICHARGE_CONNECTOR_ID) {
      pricePerKwh = 15000;
      sessionFee = 1200;
    } else if (connectorId === EVAN_CONNECTOR_ID) {
      pricePerKwh = 16000;
      sessionFee = 1500;
    }

    const energyCost = Math.round(energyDelivered * pricePerKwh);
    return sessionFee + energyCost;
  }

  describe('Given a user with a vehicle and payment method', () => {
    describe('When the user completes charging sessions at 3 different operators in sequence', () => {
      it('Then all sessions complete successfully with correct operator context', async () => {
        const baseDate = new Date('2026-02-18T08:00:00.000Z');

        // Session 1: EV Armenia
        const evArmeniaStartTime = new Date(baseDate.getTime());
        const evArmeniaEndTime = new Date(baseDate.getTime() + 30 * 60 * 1000); // +30 minutes
        const evArmeniaSession = await createAndCompleteSession({
          connectorId: EV_ARMENIA_CONNECTOR_ID,
          startTime: evArmeniaStartTime,
          endTime: evArmeniaEndTime,
          energyDelivered: 25.5,
        });

        expect(evArmeniaSession.totalCost).toBeGreaterThan(0);

        // Session 2: iCharge
        const ichargeStartTime = new Date(baseDate.getTime() + 60 * 60 * 1000); // +1 hour
        const ichargeEndTime = new Date(baseDate.getTime() + 90 * 60 * 1000); // +1.5 hours
        const ichargeSession = await createAndCompleteSession({
          connectorId: ICHARGE_CONNECTOR_ID,
          startTime: ichargeStartTime,
          endTime: ichargeEndTime,
          energyDelivered: 30.2,
        });

        expect(ichargeSession.totalCost).toBeGreaterThan(0);

        // Session 3: EVAN
        const evanStartTime = new Date(baseDate.getTime() + 120 * 60 * 1000); // +2 hours
        const evanEndTime = new Date(baseDate.getTime() + 145 * 60 * 1000); // +2.42 hours
        const evanSession = await createAndCompleteSession({
          connectorId: EVAN_CONNECTOR_ID,
          startTime: evanStartTime,
          endTime: evanEndTime,
          energyDelivered: 28.8,
        });

        expect(evanSession.totalCost).toBeGreaterThan(0);

        // Verify all sessions exist in database with correct operators
        const evArmeniaDbSession = await prismaService.session.findUnique({
          where: { id: evArmeniaSession.id },
          include: {
            connector: {
              include: {
                station: {
                  select: {
                    operatorId: true,
                    operatorName: true,
                  },
                },
              },
            },
          },
        });

        expect(evArmeniaDbSession).not.toBeNull();
        expect(evArmeniaDbSession?.connector?.station.operatorId).toBe('ev_armenia');
        expect(evArmeniaDbSession?.connector?.station.operatorName).toBe('EV Armenia');

        const ichargeDbSession = await prismaService.session.findUnique({
          where: { id: ichargeSession.id },
          include: {
            connector: {
              include: {
                station: {
                  select: {
                    operatorId: true,
                    operatorName: true,
                  },
                },
              },
            },
          },
        });

        expect(ichargeDbSession).not.toBeNull();
        expect(ichargeDbSession?.connector?.station.operatorId).toBe('icharge');
        expect(ichargeDbSession?.connector?.station.operatorName).toBe('iCharge Armenia');

        const evanDbSession = await prismaService.session.findUnique({
          where: { id: evanSession.id },
          include: {
            connector: {
              include: {
                station: {
                  select: {
                    operatorId: true,
                    operatorName: true,
                  },
                },
              },
            },
          },
        });

        expect(evanDbSession).not.toBeNull();
        expect(evanDbSession?.connector?.station.operatorId).toBe('evan');
        expect(evanDbSession?.connector?.station.operatorName).toBe('EVAN Charge');

        // Verify session history shows all 3 sessions
        const sessionHistory = await sessionsService.getSessionHistory(TEST_USER_ID, {
          status: SharedSessionStatus.COMPLETED,
        });

        expect(sessionHistory.sessions.length).toBeGreaterThanOrEqual(3);

        const sessionIds = sessionHistory.sessions.map((s) => s.id);
        expect(sessionIds).toContain(evArmeniaSession.id);
        expect(sessionIds).toContain(ichargeSession.id);
        expect(sessionIds).toContain(evanSession.id);

        // Verify each session has correct station info in history
        const evArmeniaHistoryItem = sessionHistory.sessions.find(
          (s) => s.id === evArmeniaSession.id,
        );
        expect(evArmeniaHistoryItem?.stationName).toBe('EV Armenia Kentron Hub');

        const ichargeHistoryItem = sessionHistory.sessions.find((s) => s.id === ichargeSession.id);
        expect(ichargeHistoryItem?.stationName).toBe('iCharge Republic Square');

        const evanHistoryItem = sessionHistory.sessions.find((s) => s.id === evanSession.id);
        expect(evanHistoryItem?.stationName).toBe('EVAN Cascade Shopping Center');
      });
    });

    describe('When querying session history across operators', () => {
      it('Then returns sessions from all operators in correct order', async () => {
        const baseDate = new Date('2026-02-18T10:00:00.000Z');

        // Create sessions at all 3 operators
        await createAndCompleteSession({
          connectorId: EV_ARMENIA_CONNECTOR_ID,
          startTime: new Date(baseDate.getTime()),
          endTime: new Date(baseDate.getTime() + 20 * 60 * 1000),
          energyDelivered: 15.5,
        });

        await createAndCompleteSession({
          connectorId: ICHARGE_CONNECTOR_ID,
          startTime: new Date(baseDate.getTime() + 30 * 60 * 1000),
          endTime: new Date(baseDate.getTime() + 50 * 60 * 1000),
          energyDelivered: 18.2,
        });

        await createAndCompleteSession({
          connectorId: EVAN_CONNECTOR_ID,
          startTime: new Date(baseDate.getTime() + 60 * 60 * 1000),
          endTime: new Date(baseDate.getTime() + 80 * 60 * 1000),
          energyDelivered: 22.1,
        });

        // Query session history
        const history = await sessionsService.getSessionHistory(TEST_USER_ID, {
          page: 1,
          limit: 10,
        });

        expect(history.sessions.length).toBe(3);
        expect(history.total).toBe(3);

        // Verify sessions are ordered by creation time (most recent first)
        const stationNames = history.sessions.map((s) => s.stationName);
        expect(stationNames).toEqual([
          'EVAN Cascade Shopping Center',
          'iCharge Republic Square',
          'EV Armenia Kentron Hub',
        ]);

        // Verify all sessions are completed
        const allCompleted = history.sessions.every(
          (s) => s.status === SharedSessionStatus.COMPLETED,
        );
        expect(allCompleted).toBe(true);
      });
    });
  });
});
