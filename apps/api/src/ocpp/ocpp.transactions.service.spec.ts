import type {
  OcppStartTransactionRequest,
  OcppStopTransactionRequest,
} from '@lilocharge/shared-types';
import { Prisma, SessionStatus } from '@prisma/client';

import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PaymentsService } from '../payments/payments.service';
import type { WalletService } from '../wallet/wallet.service';
import type {
  SessionCostCalculationResult,
  SessionCostCalculatorService,
} from '../sessions/session-cost-calculator.service';
import { SessionSettlementService } from '../sessions/session-settlement.service';
import { OcppIdTagService } from './ocpp.id-tag.service';
import type {
  OcppRemoteStartService,
  OcppTrackedRemoteStartTransaction,
} from './ocpp.remote-start.service';
import { OcppTransactionsService } from './ocpp.transactions.service';

interface SessionStopLookupRecord {
  readonly connectorId: string | null;
  readonly createdAt: Date;
  readonly id: string;
  readonly meterStart?: number | null;
  readonly startTime: Date | null;
  readonly status: SessionStatus;
  readonly userId: string;
}

interface MeterValueAggregateRecord {
  readonly _max: {
    readonly energyActiveImport: number | null;
    readonly powerActiveImport: number | null;
  };
  readonly _min: {
    readonly energyActiveImport: number | null;
  };
}

interface PrismaConnectorDelegateMock {
  readonly findFirst: jest.Mock<Promise<{ readonly id: string } | null>, [unknown]>;
}

interface PrismaUserDelegateMock {
  readonly findUnique: jest.Mock<Promise<{ readonly id: string } | null>, [unknown]>;
}

interface PrismaSessionDelegateMock {
  readonly count: jest.Mock<Promise<number>, [unknown]>;
  readonly create: jest.Mock<Promise<{ readonly id: string }>, [unknown]>;
  readonly findFirst: jest.Mock<Promise<SessionStopLookupRecord | null>, [unknown]>;
  readonly findUnique: jest.Mock<Promise<unknown>, [unknown]>;
  readonly update: jest.Mock<Promise<{ readonly id: string }>, [unknown]>;
}

interface PrismaMeterValueDelegateMock {
  readonly aggregate: jest.Mock<Promise<MeterValueAggregateRecord>, [unknown]>;
}

interface PrismaPaymentDelegateMock {
  readonly create: jest.Mock<Promise<{ readonly id: string }>, [unknown]>;
}

interface PrismaPaymentMethodDelegateMock {
  readonly findFirst: jest.Mock<Promise<{ readonly id: string } | null>, [unknown]>;
}

interface PrismaServiceMock {
  readonly $transaction: jest.Mock<Promise<unknown>, [(tx: unknown) => Promise<unknown>, unknown?]>;
  readonly connector: PrismaConnectorDelegateMock;
  readonly meterValue: PrismaMeterValueDelegateMock;
  readonly payment: PrismaPaymentDelegateMock;
  readonly paymentMethod: PrismaPaymentMethodDelegateMock;
  readonly session: PrismaSessionDelegateMock;
  readonly user: PrismaUserDelegateMock;
}

interface SessionCostCalculatorServiceMock extends Pick<
  SessionCostCalculatorService,
  'calculateSessionCost'
> {
  readonly calculateSessionCost: jest.Mock<
    ReturnType<SessionCostCalculatorService['calculateSessionCost']>,
    Parameters<SessionCostCalculatorService['calculateSessionCost']>
  >;
}

interface OcppRemoteStartServiceMock extends Pick<
  OcppRemoteStartService,
  'linkTransactionIdToTrackedRemoteStart'
> {
  readonly linkTransactionIdToTrackedRemoteStart: jest.Mock<
    ReturnType<OcppRemoteStartService['linkTransactionIdToTrackedRemoteStart']>,
    Parameters<OcppRemoteStartService['linkTransactionIdToTrackedRemoteStart']>
  >;
}

interface PaymentsServiceMock extends Pick<
  PaymentsService,
  'captureAuthorizedPaymentForSession' | 'refundPaymentForSessionFailure'
> {
  readonly captureAuthorizedPaymentForSession: jest.Mock<
    ReturnType<PaymentsService['captureAuthorizedPaymentForSession']>,
    Parameters<PaymentsService['captureAuthorizedPaymentForSession']>
  >;
  readonly refundPaymentForSessionFailure: jest.Mock<
    ReturnType<PaymentsService['refundPaymentForSessionFailure']>,
    Parameters<PaymentsService['refundPaymentForSessionFailure']>
  >;
}

interface WalletServiceMock extends Pick<WalletService, 'deductBalance'> {
  readonly deductBalance: jest.Mock<
    ReturnType<WalletService['deductBalance']>,
    Parameters<WalletService['deductBalance']>
  >;
}

interface NotificationsServiceMock extends Pick<
  NotificationsService,
  'sendSessionCompletedNotification' | 'sendSessionStartedNotification'
> {
  readonly sendSessionCompletedNotification: jest.Mock<
    ReturnType<NotificationsService['sendSessionCompletedNotification']>,
    Parameters<NotificationsService['sendSessionCompletedNotification']>
  >;
  readonly sendSessionStartedNotification: jest.Mock<
    ReturnType<NotificationsService['sendSessionStartedNotification']>,
    Parameters<NotificationsService['sendSessionStartedNotification']>
  >;
}

const USER_ID = '11111111-1111-4111-8111-111111111111';
const API_SESSION_ID = '55555555-5555-4555-8555-555555555555';

/** Builds one valid OCPP StartTransaction payload fixture. */
function buildStartPayload(
  overrides?: Partial<OcppStartTransactionRequest>,
): OcppStartTransactionRequest {
  return {
    connectorId: 1,
    idTag: USER_ID,
    meterStart: 12_800,
    timestamp: '2026-02-17T12:00:00.000Z',
    ...overrides,
  };
}

/** Builds one valid OCPP StopTransaction payload fixture. */
function buildStopPayload(
  overrides?: Partial<OcppStopTransactionRequest>,
): OcppStopTransactionRequest {
  return {
    meterStop: 15_200,
    timestamp: '2026-02-17T12:30:00.000Z',
    transactionId: 7001,
    ...overrides,
  };
}

/** Builds one full session-cost calculation response fixture for strict typed mocks. */
function buildCostCalculationResult(
  overrides?: Partial<SessionCostCalculationResult>,
): SessionCostCalculationResult {
  return {
    chargingDurationMinutes: 30,
    idleDurationMinutes: 0,
    totalCost: 1196,
    ...overrides,
  };
}

/** Builds one tracked remote-start record fixture linked to an API session. */
function buildTrackedRemoteStart(
  overrides?: Partial<OcppTrackedRemoteStartTransaction>,
): OcppTrackedRemoteStartTransaction {
  return {
    attemptCount: 1,
    chargePointId: 'ev-armenia-001',
    connectorId: 1,
    expiresAt: '2026-02-17T12:05:00.000Z',
    idTag: USER_ID,
    remoteStartRequestId: 'tracking-1',
    requestedAt: '2026-02-17T12:00:00.000Z',
    sequence: 1,
    sessionId: API_SESSION_ID,
    transactionId: 7001,
    updatedAt: '2026-02-17T12:00:00.000Z',
    ...overrides,
  };
}

/** Builds one active session lookup fixture for the stop/finalization paths. */
function buildStopLookupRecord(
  overrides?: Partial<SessionStopLookupRecord>,
): SessionStopLookupRecord {
  return {
    connectorId: 'connector-1',
    createdAt: new Date('2026-02-17T11:59:55.000Z'),
    id: 'session-1',
    meterStart: null,
    startTime: new Date('2026-02-17T12:00:00.000Z'),
    status: SessionStatus.ACTIVE,
    userId: USER_ID,
    ...overrides,
  };
}

describe('OcppTransactionsService', () => {
  let notificationsServiceMock: NotificationsServiceMock;
  let paymentsServiceMock: PaymentsServiceMock;
  let walletServiceMock: WalletServiceMock;
  let sessionCostCalculatorServiceMock: SessionCostCalculatorServiceMock;
  let prismaMock: PrismaServiceMock;
  let remoteStartServiceMock: OcppRemoteStartServiceMock;
  let service: OcppTransactionsService;

  beforeEach(() => {
    prismaMock = {
      $transaction: jest
        .fn<Promise<unknown>, [(tx: unknown) => Promise<unknown>, unknown?]>()
        .mockImplementation(async (callback) => callback(prismaMock)),
      connector: {
        findFirst: jest.fn<Promise<{ readonly id: string } | null>, [unknown]>(),
      },
      meterValue: {
        aggregate: jest.fn<Promise<MeterValueAggregateRecord>, [unknown]>(),
      },
      payment: {
        create: jest.fn<Promise<{ readonly id: string }>, [unknown]>().mockResolvedValue({
          id: 'payment-1',
        }),
      },
      paymentMethod: {
        findFirst: jest
          .fn<Promise<{ readonly id: string } | null>, [unknown]>()
          .mockResolvedValue(null),
      },
      session: {
        count: jest.fn<Promise<number>, [unknown]>().mockResolvedValue(0),
        create: jest.fn<Promise<{ readonly id: string }>, [unknown]>(),
        findFirst: jest.fn<Promise<SessionStopLookupRecord | null>, [unknown]>(),
        findUnique: jest.fn<Promise<unknown>, [unknown]>(),
        update: jest.fn<Promise<{ readonly id: string }>, [unknown]>(),
      },
      user: {
        findUnique: jest.fn<Promise<{ readonly id: string } | null>, [unknown]>(),
      },
    };
    sessionCostCalculatorServiceMock = {
      calculateSessionCost: jest.fn<
        ReturnType<SessionCostCalculatorService['calculateSessionCost']>,
        Parameters<SessionCostCalculatorService['calculateSessionCost']>
      >(),
    };
    remoteStartServiceMock = {
      linkTransactionIdToTrackedRemoteStart: jest
        .fn<
          ReturnType<OcppRemoteStartService['linkTransactionIdToTrackedRemoteStart']>,
          Parameters<OcppRemoteStartService['linkTransactionIdToTrackedRemoteStart']>
        >()
        .mockResolvedValue(null),
    };
    paymentsServiceMock = {
      captureAuthorizedPaymentForSession: jest.fn<
        ReturnType<PaymentsService['captureAuthorizedPaymentForSession']>,
        Parameters<PaymentsService['captureAuthorizedPaymentForSession']>
      >(),
      refundPaymentForSessionFailure: jest.fn<
        ReturnType<PaymentsService['refundPaymentForSessionFailure']>,
        Parameters<PaymentsService['refundPaymentForSessionFailure']>
      >(),
    };
    walletServiceMock = {
      deductBalance: jest.fn<
        ReturnType<WalletService['deductBalance']>,
        Parameters<WalletService['deductBalance']>
      >(),
    };
    notificationsServiceMock = {
      sendSessionCompletedNotification: jest.fn<
        ReturnType<NotificationsService['sendSessionCompletedNotification']>,
        Parameters<NotificationsService['sendSessionCompletedNotification']>
      >(),
      sendSessionStartedNotification: jest.fn<
        ReturnType<NotificationsService['sendSessionStartedNotification']>,
        Parameters<NotificationsService['sendSessionStartedNotification']>
      >(),
    };
    // Real settlement service over the shared mocks so the charger-stop path is asserted
    // against the exact rules the API stop path uses.
    const sessionSettlementService = new SessionSettlementService(
      prismaMock as unknown as PrismaService,
      paymentsServiceMock as unknown as PaymentsService,
      walletServiceMock as unknown as WalletService,
    );
    service = new OcppTransactionsService(
      prismaMock as unknown as PrismaService,
      sessionCostCalculatorServiceMock as unknown as SessionCostCalculatorService,
      sessionSettlementService,
      notificationsServiceMock as unknown as NotificationsService,
      remoteStartServiceMock as unknown as OcppRemoteStartService,
      new OcppIdTagService(),
    );
  });

  it('creates an active session and returns an accepted StartTransaction response', async () => {
    prismaMock.connector.findFirst.mockResolvedValue({ id: 'connector-1' });
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
    prismaMock.session.create.mockResolvedValue({ id: 'session-1' });

    const response = await service.handleStartTransaction('ev-armenia-001', buildStartPayload());

    expect(response.idTagInfo.status).toBe('Accepted');
    expect(response.transactionId).toBeGreaterThan(0);
    expect(prismaMock.session.create).toHaveBeenCalledWith({
      data: {
        connectorId: 'connector-1',
        meterStart: 12800,
        startTime: new Date('2026-02-17T12:00:00.000Z'),
        status: SessionStatus.ACTIVE,
        transactionId: String(response.transactionId),
        userId: USER_ID,
      },
      select: {
        id: true,
      },
    });
    expect(remoteStartServiceMock.linkTransactionIdToTrackedRemoteStart).toHaveBeenCalledWith({
      chargePointId: 'ev-armenia-001',
      connectorId: 1,
      idTag: USER_ID,
      transactionId: response.transactionId,
    });
    expect(notificationsServiceMock.sendSessionStartedNotification).toHaveBeenCalledWith({
      sessionId: 'session-1',
      userId: USER_ID,
    });
  });

  it('returns Invalid StartTransaction response when idTag cannot be mapped to a user', async () => {
    prismaMock.connector.findFirst.mockResolvedValue({ id: 'connector-1' });

    const response = await service.handleStartTransaction(
      'ev-armenia-001',
      buildStartPayload({
        idTag: 'user-123',
      }),
    );

    expect(response).toEqual({
      idTagInfo: {
        status: 'Invalid',
      },
      transactionId: 0,
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.session.create).not.toHaveBeenCalled();
    expect(remoteStartServiceMock.linkTransactionIdToTrackedRemoteStart).not.toHaveBeenCalled();
    expect(notificationsServiceMock.sendSessionStartedNotification).not.toHaveBeenCalled();
  });

  describe('remote-start attach path (no duplicate sessions)', () => {
    it('attaches the inbound transaction to the tracked API session instead of creating one', async () => {
      prismaMock.connector.findFirst.mockResolvedValue({ id: 'connector-1' });
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      remoteStartServiceMock.linkTransactionIdToTrackedRemoteStart.mockImplementation((input) =>
        Promise.resolve(buildTrackedRemoteStart({ transactionId: input.transactionId })),
      );
      prismaMock.session.findUnique.mockResolvedValue({
        id: API_SESSION_ID,
        startTime: null,
        status: SessionStatus.AUTHORIZED,
      });
      prismaMock.session.update.mockResolvedValue({ id: API_SESSION_ID });

      const response = await service.handleStartTransaction('ev-armenia-001', buildStartPayload());

      expect(response.idTagInfo.status).toBe('Accepted');
      expect(response.transactionId).toBeGreaterThan(0);
      // The API session is updated in place: transaction id + meterStart attached, and the
      // AUTHORIZED session is activated because the charger beat the API's own transition.
      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: API_SESSION_ID },
        data: {
          meterStart: 12800,
          startTime: new Date('2026-02-17T12:00:00.000Z'),
          status: SessionStatus.ACTIVE,
          transactionId: String(response.transactionId),
        },
        select: { id: true },
      });
      expect(prismaMock.session.create).not.toHaveBeenCalled();
      // The API start path already sends the session-started notification for this session.
      expect(notificationsServiceMock.sendSessionStartedNotification).not.toHaveBeenCalled();
    });

    it('keeps an already ACTIVE API session active and preserves its start time', async () => {
      prismaMock.connector.findFirst.mockResolvedValue({ id: 'connector-1' });
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      remoteStartServiceMock.linkTransactionIdToTrackedRemoteStart.mockImplementation((input) =>
        Promise.resolve(buildTrackedRemoteStart({ transactionId: input.transactionId })),
      );
      const apiStartTime = new Date('2026-02-17T11:59:00.000Z');
      prismaMock.session.findUnique.mockResolvedValue({
        id: API_SESSION_ID,
        startTime: apiStartTime,
        status: SessionStatus.ACTIVE,
      });
      prismaMock.session.update.mockResolvedValue({ id: API_SESSION_ID });

      await service.handleStartTransaction('ev-armenia-001', buildStartPayload());

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            startTime: apiStartTime,
            status: SessionStatus.ACTIVE,
          }) as Record<string, unknown>,
        }),
      );
      expect(prismaMock.session.create).not.toHaveBeenCalled();
    });

    it('falls back to session creation when the tracked session is already terminal', async () => {
      prismaMock.connector.findFirst.mockResolvedValue({ id: 'connector-1' });
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      remoteStartServiceMock.linkTransactionIdToTrackedRemoteStart.mockImplementation((input) =>
        Promise.resolve(buildTrackedRemoteStart({ transactionId: input.transactionId })),
      );
      prismaMock.session.findUnique.mockResolvedValue({
        id: API_SESSION_ID,
        startTime: null,
        status: SessionStatus.CANCELLED,
      });
      prismaMock.session.create.mockResolvedValue({ id: 'session-new' });

      const response = await service.handleStartTransaction('ev-armenia-001', buildStartPayload());

      expect(response.idTagInfo.status).toBe('Accepted');
      expect(prismaMock.session.create).toHaveBeenCalledTimes(1);
    });

    it('falls back to session creation when the tracking record carries no session id', async () => {
      prismaMock.connector.findFirst.mockResolvedValue({ id: 'connector-1' });
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      remoteStartServiceMock.linkTransactionIdToTrackedRemoteStart.mockImplementation((input) =>
        Promise.resolve(
          buildTrackedRemoteStart({ sessionId: null, transactionId: input.transactionId }),
        ),
      );
      prismaMock.session.create.mockResolvedValue({ id: 'session-new' });

      const response = await service.handleStartTransaction('ev-armenia-001', buildStartPayload());

      expect(response.idTagInfo.status).toBe('Accepted');
      expect(prismaMock.session.update).not.toHaveBeenCalled();
      expect(prismaMock.session.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('one-session-per-connector guard on charger-local starts', () => {
    it('answers ConcurrentTx and creates nothing when the connector already has a blocking session', async () => {
      prismaMock.connector.findFirst.mockResolvedValue({ id: 'connector-1' });
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaMock.session.count.mockResolvedValue(1);

      const response = await service.handleStartTransaction('ev-armenia-001', buildStartPayload());

      expect(response).toEqual({
        idTagInfo: {
          status: 'ConcurrentTx',
        },
        transactionId: 0,
      });
      expect(prismaMock.session.count).toHaveBeenCalledWith({
        where: {
          connectorId: 'connector-1',
          status: {
            in: [SessionStatus.PENDING, SessionStatus.AUTHORIZED, SessionStatus.ACTIVE],
          },
        },
      });
      expect(prismaMock.session.create).not.toHaveBeenCalled();
      expect(notificationsServiceMock.sendSessionStartedNotification).not.toHaveBeenCalled();
    });

    it('runs the guard and insert inside one serializable transaction', async () => {
      prismaMock.connector.findFirst.mockResolvedValue({ id: 'connector-1' });
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaMock.session.create.mockResolvedValue({ id: 'session-1' });

      await service.handleStartTransaction('ev-armenia-001', buildStartPayload());

      expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    });

    it('answers ConcurrentTx when the serializable transaction hits a write conflict (P2034)', async () => {
      prismaMock.connector.findFirst.mockResolvedValue({ id: 'connector-1' });
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaMock.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('write conflict', {
          clientVersion: '5.22.0',
          code: 'P2034',
        }),
      );

      const response = await service.handleStartTransaction('ev-armenia-001', buildStartPayload());

      expect(response.idTagInfo.status).toBe('ConcurrentTx');
      expect(notificationsServiceMock.sendSessionStartedNotification).not.toHaveBeenCalled();
    });
  });

  it('accepts Authorize requests when the idTag resolves to an existing user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });

    const response = await service.handleAuthorize('ev-armenia-001', { idTag: USER_ID });

    expect(response).toEqual({
      idTagInfo: {
        status: 'Accepted',
      },
    });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: USER_ID },
      select: { id: true },
    });
  });

  it('rejects Authorize requests when the idTag cannot be mapped to a user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const malformedResponse = await service.handleAuthorize('ev-armenia-001', {
      idTag: 'user-123',
    });
    const unknownUserResponse = await service.handleAuthorize('ev-armenia-001', {
      idTag: '99999999-9999-4999-8999-999999999999',
    });

    expect(malformedResponse).toEqual({
      idTagInfo: {
        status: 'Invalid',
      },
    });
    expect(unknownUserResponse).toEqual({
      idTagInfo: {
        status: 'Invalid',
      },
    });
  });

  it('completes a session on StopTransaction and captures the gateway pre-authorization', async () => {
    prismaMock.session.findFirst.mockResolvedValue(buildStopLookupRecord());
    prismaMock.meterValue.aggregate.mockResolvedValue({
      _max: {
        energyActiveImport: 15_200,
        powerActiveImport: 7_600,
      },
      _min: {
        energyActiveImport: 12_800,
      },
    });
    sessionCostCalculatorServiceMock.calculateSessionCost.mockResolvedValue(
      buildCostCalculationResult({ totalCost: 3900 }),
    );
    prismaMock.session.update.mockResolvedValue({ id: 'session-1' });

    const response = await service.handleStopTransaction('ev-armenia-001', buildStopPayload());

    expect(response).toEqual({});
    expect(sessionCostCalculatorServiceMock.calculateSessionCost).toHaveBeenCalledWith({
      connectorId: 'connector-1',
      energyDeliveredKwh: 2.4,
      sessionId: 'session-1',
      startedAt: new Date('2026-02-17T12:00:00.000Z'),
      stoppedAt: new Date('2026-02-17T12:30:00.000Z'),
    });
    expect(prismaMock.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: {
        endTime: new Date('2026-02-17T12:30:00.000Z'),
        energyDelivered: 2.4,
        peakPower: 7.6,
        status: SessionStatus.COMPLETED,
        totalCost: 3900,
      },
    });
    expect(paymentsServiceMock.captureAuthorizedPaymentForSession).toHaveBeenCalledWith({
      amount: 3900,
      sessionId: 'session-1',
    });
    expect(walletServiceMock.deductBalance).not.toHaveBeenCalled();
    expect(paymentsServiceMock.refundPaymentForSessionFailure).not.toHaveBeenCalled();
    expect(notificationsServiceMock.sendSessionCompletedNotification).toHaveBeenCalledWith({
      sessionId: 'session-1',
      totalCostAmd: 3900,
      userId: USER_ID,
    });
  });

  describe('charger-stop settlement parity with the API stop path', () => {
    it('bills wallet-default users from their wallet with a wallet payment record', async () => {
      prismaMock.session.findFirst.mockResolvedValue(buildStopLookupRecord());
      prismaMock.meterValue.aggregate.mockResolvedValue({
        _max: {
          energyActiveImport: 15_200,
          powerActiveImport: 7_600,
        },
        _min: {
          energyActiveImport: 12_800,
        },
      });
      sessionCostCalculatorServiceMock.calculateSessionCost.mockResolvedValue(
        buildCostCalculationResult({ totalCost: 3900 }),
      );
      prismaMock.session.update.mockResolvedValue({ id: 'session-1' });
      prismaMock.paymentMethod.findFirst.mockResolvedValue({ id: 'wallet-pm-1' });

      await service.handleStopTransaction('ev-armenia-001', buildStopPayload());

      expect(walletServiceMock.deductBalance).toHaveBeenCalledWith({
        amount: 3900,
        sessionId: 'session-1',
        userId: USER_ID,
      });
      expect(prismaMock.payment.create).toHaveBeenCalledTimes(1);
      expect(paymentsServiceMock.captureAuthorizedPaymentForSession).not.toHaveBeenCalled();
      expect(paymentsServiceMock.refundPaymentForSessionFailure).not.toHaveBeenCalled();
    });

    it('bills zero and refunds the pre-authorization for zero-energy charger stops', async () => {
      prismaMock.session.findFirst.mockResolvedValue(
        buildStopLookupRecord({ meterStart: 15_200 }),
      );
      prismaMock.meterValue.aggregate.mockResolvedValue({
        _max: {
          energyActiveImport: null,
          powerActiveImport: null,
        },
        _min: {
          energyActiveImport: null,
        },
      });
      sessionCostCalculatorServiceMock.calculateSessionCost.mockResolvedValue(
        buildCostCalculationResult({ totalCost: 750 }),
      );
      prismaMock.session.update.mockResolvedValue({ id: 'session-1' });

      await service.handleStopTransaction('ev-armenia-001', buildStopPayload());

      // Time/session fees computed by the calculator must NOT be billed for zero energy.
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            energyDelivered: 0,
            totalCost: 0,
          }) as Record<string, unknown>,
        }),
      );
      expect(paymentsServiceMock.refundPaymentForSessionFailure).toHaveBeenCalledWith('session-1');
      expect(paymentsServiceMock.captureAuthorizedPaymentForSession).not.toHaveBeenCalled();
      expect(walletServiceMock.deductBalance).not.toHaveBeenCalled();
      expect(notificationsServiceMock.sendSessionCompletedNotification).toHaveBeenCalledWith({
        sessionId: 'session-1',
        totalCostAmd: 0,
        userId: USER_ID,
      });
    });

    it('still completes the session when settlement fails (charger cannot receive an error)', async () => {
      prismaMock.session.findFirst.mockResolvedValue(buildStopLookupRecord());
      prismaMock.meterValue.aggregate.mockResolvedValue({
        _max: {
          energyActiveImport: 15_200,
          powerActiveImport: 7_600,
        },
        _min: {
          energyActiveImport: 12_800,
        },
      });
      sessionCostCalculatorServiceMock.calculateSessionCost.mockResolvedValue(
        buildCostCalculationResult({ totalCost: 3900 }),
      );
      prismaMock.session.update.mockResolvedValue({ id: 'session-1' });
      paymentsServiceMock.captureAuthorizedPaymentForSession.mockRejectedValue(
        new Error('gateway timeout'),
      );

      const response = await service.handleStopTransaction('ev-armenia-001', buildStopPayload());

      expect(response).toEqual({});
      expect(prismaMock.session.update).toHaveBeenCalledTimes(1);
    });
  });

  it('acknowledges StopTransaction when no matching session can be resolved', async () => {
    prismaMock.session.findFirst.mockResolvedValue(null);

    const response = await service.handleStopTransaction('ev-armenia-001', buildStopPayload());

    expect(response).toEqual({});
    expect(prismaMock.meterValue.aggregate).not.toHaveBeenCalled();
    expect(sessionCostCalculatorServiceMock.calculateSessionCost).not.toHaveBeenCalled();
    expect(prismaMock.session.update).not.toHaveBeenCalled();
    expect(paymentsServiceMock.captureAuthorizedPaymentForSession).not.toHaveBeenCalled();
    expect(notificationsServiceMock.sendSessionCompletedNotification).not.toHaveBeenCalled();
  });

  it('falls back to zero final cost when pricing calculation fails', async () => {
    prismaMock.session.findFirst.mockResolvedValue(buildStopLookupRecord());
    prismaMock.meterValue.aggregate.mockResolvedValue({
      _max: {
        energyActiveImport: 15_200,
        powerActiveImport: 7_600,
      },
      _min: {
        energyActiveImport: 12_800,
      },
    });
    sessionCostCalculatorServiceMock.calculateSessionCost.mockRejectedValue(
      new Error('pricing plan missing'),
    );
    prismaMock.session.update.mockResolvedValue({ id: 'session-1' });

    await service.handleStopTransaction('ev-armenia-001', buildStopPayload());

    const [updateCall] = prismaMock.session.update.mock.calls[0] ?? [];
    const data = (
      updateCall as {
        readonly data: {
          readonly totalCost: number;
        };
      }
    ).data;

    expect(data.totalCost).toBe(0);
    expect(paymentsServiceMock.captureAuthorizedPaymentForSession).toHaveBeenCalledWith({
      amount: 0,
      sessionId: 'session-1',
    });
    expect(notificationsServiceMock.sendSessionCompletedNotification).toHaveBeenCalledWith({
      sessionId: 'session-1',
      totalCostAmd: 0,
      userId: USER_ID,
    });
  });
});
