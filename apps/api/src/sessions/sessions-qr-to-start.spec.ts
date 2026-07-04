import type {
  CreateSessionRequest,
  OcppRemoteStartTransactionResponse,
  SessionResponse,
  StartSessionRequest,
} from '@lilocharge/shared-types';
import { OcppAction, SessionStatus } from '@lilocharge/shared-types';
import { SessionStatus as PrismaSessionStatus } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { OcppRegistryService } from '../ocpp/ocpp.registry.service';
import { OcppRemoteStartService } from '../ocpp/ocpp.remote-start.service';
import { OcppRemoteStopService } from '../ocpp/ocpp.remote-stop.service';
import type {
  OcppRpcCallOptions,
  OcppRpcHandler,
  OcppServerClient,
} from '../ocpp/ocpp.server.types';
import { PaymentsService } from '../payments/payments.service';
import type { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { SessionCostCalculatorService } from './session-cost-calculator.service';
import { SessionsService } from './sessions.service';

/**
 * Mock OCPP charge point client fixture for testing.
 * Simulates a real charge point that can respond to RemoteStartTransaction commands.
 */
interface MockChargePointFixture {
  readonly callMock: jest.Mock<Promise<unknown>, [string, unknown, OcppRpcCallOptions?]>;
  readonly client: OcppServerClient;
  readonly identity: string;
}

interface PrismaSessionDelegateMock {
  create: jest.Mock;
  findFirst: jest.Mock;
  update: jest.Mock;
}

interface PrismaUserDelegateMock {
  findUnique: jest.Mock;
}

interface PrismaConnectorDelegateMock {
  findUnique: jest.Mock;
}

interface PrismaPaymentMethodDelegateMock {
  findFirst: jest.Mock;
}

interface PrismaServiceMock {
  connector: PrismaConnectorDelegateMock;
  paymentMethod: PrismaPaymentMethodDelegateMock;
  session: PrismaSessionDelegateMock;
  user: PrismaUserDelegateMock;
}

/**
 * Creates a mock OCPP charge point client that simulates charge point behavior.
 * @param identity - Charge point identifier
 * @returns Mock charge point fixture with client and call mock
 */
function createMockChargePoint(identity: string): MockChargePointFixture {
  const callMock = jest.fn<Promise<unknown>, [string, unknown, OcppRpcCallOptions?]>();
  const call = <TResponse>(
    method: string,
    params?: unknown,
    options?: OcppRpcCallOptions,
  ): Promise<TResponse> => {
    return callMock(method, params, options) as Promise<TResponse>;
  };

  return {
    callMock,
    client: {
      call,
      handle: jest.fn<void, [string | OcppRpcHandler, OcppRpcHandler?]>(),
      handshake: { endpoint: `/ocpp/${identity}` },
      identity,
      on: jest.fn<void, [string, (...args: unknown[]) => void]>(),
      protocol: 'ocpp1.6',
      session: { connectedAt: new Date().toISOString() },
    },
    identity,
  };
}

/**
 * Unit test suite: QR Scan to Session Start with OCPP RemoteStart
 *
 * This test simulates the complete flow:
 * 1. User scans QR code (getting connector ID)
 * 2. User creates a session with the connector
 * 3. User starts the session
 * 4. Backend sends OCPP RemoteStartTransaction to the charge point
 * 5. Charge point accepts and session becomes ACTIVE
 */
describe('SessionsService - QR Scan to Session Start', () => {
  let sessionsService: SessionsService;
  let mockPrismaService: PrismaServiceMock;
  let ocppRegistryService: OcppRegistryService;
  let ocppRemoteStartService: OcppRemoteStartService;
  let mockChargePoint: MockChargePointFixture;
  let mockPaymentsService: jest.Mocked<PaymentsService>;
  let mockNotificationsService: jest.Mocked<NotificationsService>;
  let mockWalletService: jest.Mocked<WalletService>;
  let mockCostCalculatorService: jest.Mocked<SessionCostCalculatorService>;

  // Test data IDs
  const testUserId = '11111111-1111-1111-1111-111111111111';
  const testConnectorId = '22222222-2222-2222-2222-222222222222';
  const testSessionId = '33333333-3333-3333-3333-333333333333';
  const chargePointId = 'CP-TEST-001';
  const ocppConnectorId = 1;

  afterAll(() => {
    delete process.env.OCPP_WS_ENABLED;
  });

  beforeEach(() => {
    process.env.OCPP_WS_ENABLED = 'true';

    // Mock Prisma service
    mockPrismaService = {
      user: {
        findUnique: jest.fn(),
      },
      connector: {
        findUnique: jest.fn(),
      },
      session: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      paymentMethod: {
        findFirst: jest.fn(),
      },
    };

    // Mock PaymentsService
    mockPaymentsService = {
      preAuthorizeArcaForSession: jest.fn().mockResolvedValue(undefined),
      captureAuthorizedPaymentForSession: jest.fn().mockResolvedValue(undefined),
      refundPaymentForSessionFailure: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PaymentsService>;

    // Mock NotificationsService
    mockNotificationsService = {
      sendSessionStartedNotification: jest.fn().mockResolvedValue(undefined),
      sendSessionCompletedNotification: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationsService>;

    // Mock WalletService
    mockWalletService = {
      checkSufficientBalance: jest.fn().mockResolvedValue(true),
      deductBalance: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WalletService>;

    // Mock SessionCostCalculatorService (no meter data in this flow)
    mockCostCalculatorService = {
      calculateSessionCost: jest.fn().mockResolvedValue({
        chargingDurationMinutes: 0,
        idleDurationMinutes: 0,
        totalCost: 0,
      }),
    } as unknown as jest.Mocked<SessionCostCalculatorService>;

    // Create real OCPP services backed by an in-memory registry
    ocppRegistryService = new OcppRegistryService();
    ocppRemoteStartService = new OcppRemoteStartService(ocppRegistryService);
    const ocppRemoteStopService = new OcppRemoteStopService(ocppRegistryService);

    sessionsService = new SessionsService(
      mockPrismaService as unknown as PrismaService,
      mockPaymentsService,
      mockNotificationsService,
      mockWalletService,
      mockCostCalculatorService,
      ocppRemoteStartService,
      ocppRemoteStopService,
    );

    // Set up mock OCPP charge point
    mockChargePoint = createMockChargePoint(chargePointId);
    ocppRegistryService.registerChargePoint(mockChargePoint.client);

    // Configure mock charge point to accept RemoteStartTransaction commands
    mockChargePoint.callMock.mockResolvedValue({
      status: 'Accepted',
    } satisfies OcppRemoteStartTransactionResponse);

    // Default mock implementations
    mockPrismaService.user.findUnique.mockResolvedValue({ id: testUserId });
    mockPrismaService.connector.findUnique.mockResolvedValue({
      evseId: `${chargePointId}-evse-${ocppConnectorId}`,
      id: testConnectorId,
      station: { operatorId: chargePointId },
    });
    // Mock non-wallet payment method (ARCA) to trigger traditional payment flow
    mockPrismaService.paymentMethod.findFirst.mockResolvedValue(null);
  });

  describe('Complete QR Scan to Session Start Flow', () => {
    it('should create and start a session after QR scan, sending OCPP RemoteStartTransaction', async () => {
      // ===== STEP 1: User scans QR code =====
      // QR code contains connector ID (in production, might be a short code that resolves to connector ID)
      const scannedConnectorId = testConnectorId;

      // ===== STEP 2: Create session with scanned connector =====
      const createRequest: CreateSessionRequest = {
        connectorId: scannedConnectorId,
      };

      const createdSessionRecord = {
        id: testSessionId,
        userId: testUserId,
        connectorId: scannedConnectorId,
        vehicleId: null,
        status: PrismaSessionStatus.PENDING,
        startTime: null,
        endTime: null,
        energyDelivered: 0,
        peakPower: 0,
        totalCost: 0,
        transactionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.session.create.mockResolvedValue(createdSessionRecord);

      const createdSession: SessionResponse = await sessionsService.createSession(
        testUserId,
        createRequest,
      );

      expect(createdSession).toMatchObject({
        userId: testUserId,
        connectorId: scannedConnectorId,
        status: SessionStatus.PENDING,
        vehicleId: null,
        startTime: null,
        endTime: null,
        energyDelivered: 0,
        peakPower: 0,
        totalCost: 0,
      });
      expect(createdSession.id).toBe(testSessionId);

      // ===== STEP 3: Start the session =====
      const startRequest: StartSessionRequest = {
        startedAt: new Date().toISOString(),
      };

      const authorizedSessionRecord = {
        ...createdSessionRecord,
        status: PrismaSessionStatus.AUTHORIZED,
      };

      const activeSessionRecord = {
        ...createdSessionRecord,
        status: PrismaSessionStatus.ACTIVE,
        startTime: new Date(),
      };

      mockPrismaService.session.findFirst.mockResolvedValue(createdSessionRecord);
      mockPrismaService.session.update
        .mockResolvedValueOnce(authorizedSessionRecord)
        .mockResolvedValueOnce(activeSessionRecord);

      const startedSession: SessionResponse = await sessionsService.startSession(
        testUserId,
        testSessionId,
        startRequest,
      );

      // ===== VERIFY: Session is now ACTIVE =====
      expect(startedSession).toMatchObject({
        id: testSessionId,
        userId: testUserId,
        connectorId: scannedConnectorId,
        status: SessionStatus.ACTIVE,
      });
      expect(startedSession.startTime).not.toBeNull();

      // ===== VERIFY: Payment pre-authorization was called =====
      const preAuthCalls = mockPaymentsService.preAuthorizeArcaForSession.mock.calls;
      expect(preAuthCalls.length).toBeGreaterThan(0);
      expect(preAuthCalls[0][0]).toMatchObject({
        sessionId: testSessionId,
        userId: testUserId,
      });

      // ===== VERIFY: Session started notification was sent =====
      const notificationCalls = mockNotificationsService.sendSessionStartedNotification.mock.calls;
      expect(notificationCalls.length).toBeGreaterThan(0);
      expect(notificationCalls[0][0]).toMatchObject({
        sessionId: testSessionId,
        userId: testUserId,
      });

      // ===== VERIFY: RemoteStartTransaction was sent to the charge point =====
      // startSession resolves the charge point from the connector's station and dispatches
      // the OCPP RemoteStartTransaction command itself before activating the session.
      expect(mockChargePoint.callMock).toHaveBeenCalledWith(
        OcppAction.REMOTE_START_TRANSACTION,
        {
          connectorId: ocppConnectorId,
          idTag: testUserId,
        },
        expect.objectContaining({
          callTimeoutMs: expect.any(Number) as number,
        }),
      );
    });

    it('should fail to start session if connector does not exist', async () => {
      const nonExistentConnectorId = '99999999-9999-9999-9999-999999999999';
      mockPrismaService.connector.findUnique.mockResolvedValue(null);

      await expect(
        sessionsService.createSession(testUserId, {
          connectorId: nonExistentConnectorId,
        }),
      ).rejects.toThrow('Connector not found');
    });

    it('should fail to start session if user does not exist', async () => {
      const nonExistentUserId = '88888888-8888-8888-8888-888888888888';
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        sessionsService.createSession(nonExistentUserId, {
          connectorId: testConnectorId,
        }),
      ).rejects.toThrow('User not found');
    });

    it('should transition session through PENDING -> AUTHORIZED -> ACTIVE states', async () => {
      // Create session (PENDING)
      const pendingSessionRecord = {
        id: testSessionId,
        userId: testUserId,
        connectorId: testConnectorId,
        vehicleId: null,
        status: PrismaSessionStatus.PENDING,
        startTime: null,
        endTime: null,
        energyDelivered: 0,
        peakPower: 0,
        totalCost: 0,
        transactionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.session.create.mockResolvedValue(pendingSessionRecord);

      const session1 = await sessionsService.createSession(testUserId, {
        connectorId: testConnectorId,
      });
      expect(session1.status).toBe(SessionStatus.PENDING);

      // Start session (transitions to AUTHORIZED then ACTIVE)
      const authorizedSessionRecord = {
        ...pendingSessionRecord,
        status: PrismaSessionStatus.AUTHORIZED,
      };

      const activeSessionRecord = {
        ...pendingSessionRecord,
        status: PrismaSessionStatus.ACTIVE,
        startTime: new Date(),
      };

      mockPrismaService.session.findFirst.mockResolvedValue(pendingSessionRecord);
      mockPrismaService.session.update
        .mockResolvedValueOnce(authorizedSessionRecord)
        .mockResolvedValueOnce(activeSessionRecord);

      const session2 = await sessionsService.startSession(testUserId, testSessionId, {});
      expect(session2.status).toBe(SessionStatus.ACTIVE);
      expect(session2.startTime).not.toBeNull();
    });
  });

  describe('QR Code Validation', () => {
    it('should validate connector exists before creating session', async () => {
      const invalidConnectorId = '99999999-9999-9999-9999-999999999999';
      mockPrismaService.connector.findUnique.mockResolvedValue(null);

      await expect(
        sessionsService.createSession(testUserId, {
          connectorId: invalidConnectorId,
        }),
      ).rejects.toThrow('Connector not found');
    });

    it('should allow creating session without connector (for future connector selection)', async () => {
      const sessionRecord = {
        id: testSessionId,
        userId: testUserId,
        connectorId: null,
        vehicleId: null,
        status: PrismaSessionStatus.PENDING,
        startTime: null,
        endTime: null,
        energyDelivered: 0,
        peakPower: 0,
        totalCost: 0,
        transactionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.session.create.mockResolvedValue(sessionRecord);

      const session = await sessionsService.createSession(testUserId, {});

      expect(session).toMatchObject({
        userId: testUserId,
        connectorId: null,
        status: SessionStatus.PENDING,
      });
    });
  });
});
