import type {
  OcppStartTransactionRequest,
  OcppStopTransactionRequest,
} from '@lilocharge/shared-types';
import { SessionStatus } from '@prisma/client';

import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PaymentsService } from '../payments/payments.service';
import type {
  SessionCostCalculationResult,
  SessionCostCalculatorService,
} from '../sessions/session-cost-calculator.service';
import type { OcppRemoteStartService } from './ocpp.remote-start.service';
import { OcppTransactionsService } from './ocpp.transactions.service';

interface SessionStopLookupRecord {
  readonly connectorId: string | null;
  readonly createdAt: Date;
  readonly id: string;
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
  readonly create: jest.Mock<Promise<{ readonly id: string }>, [unknown]>;
  readonly findFirst: jest.Mock<Promise<SessionStopLookupRecord | null>, [unknown]>;
  readonly update: jest.Mock<Promise<{ readonly id: string }>, [unknown]>;
}

interface PrismaMeterValueDelegateMock {
  readonly aggregate: jest.Mock<Promise<MeterValueAggregateRecord>, [unknown]>;
}

interface PrismaServiceMock {
  readonly connector: PrismaConnectorDelegateMock;
  readonly meterValue: PrismaMeterValueDelegateMock;
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

interface PaymentsServiceMock extends Pick<PaymentsService, 'captureAuthorizedPaymentForSession'> {
  readonly captureAuthorizedPaymentForSession: jest.Mock<
    ReturnType<PaymentsService['captureAuthorizedPaymentForSession']>,
    Parameters<PaymentsService['captureAuthorizedPaymentForSession']>
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

describe('OcppTransactionsService', () => {
  let notificationsServiceMock: NotificationsServiceMock;
  let paymentsServiceMock: PaymentsServiceMock;
  let sessionCostCalculatorServiceMock: SessionCostCalculatorServiceMock;
  let prismaMock: PrismaServiceMock;
  let remoteStartServiceMock: OcppRemoteStartServiceMock;
  let service: OcppTransactionsService;

  beforeEach(() => {
    prismaMock = {
      connector: {
        findFirst: jest.fn<Promise<{ readonly id: string } | null>, [unknown]>(),
      },
      meterValue: {
        aggregate: jest.fn<Promise<MeterValueAggregateRecord>, [unknown]>(),
      },
      session: {
        create: jest.fn<Promise<{ readonly id: string }>, [unknown]>(),
        findFirst: jest.fn<Promise<SessionStopLookupRecord | null>, [unknown]>(),
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
      linkTransactionIdToTrackedRemoteStart: jest.fn<
        ReturnType<OcppRemoteStartService['linkTransactionIdToTrackedRemoteStart']>,
        Parameters<OcppRemoteStartService['linkTransactionIdToTrackedRemoteStart']>
      >(),
    };
    paymentsServiceMock = {
      captureAuthorizedPaymentForSession: jest.fn<
        ReturnType<PaymentsService['captureAuthorizedPaymentForSession']>,
        Parameters<PaymentsService['captureAuthorizedPaymentForSession']>
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
    service = new OcppTransactionsService(
      prismaMock as unknown as PrismaService,
      sessionCostCalculatorServiceMock as unknown as SessionCostCalculatorService,
      paymentsServiceMock as unknown as PaymentsService,
      notificationsServiceMock as unknown as NotificationsService,
      remoteStartServiceMock as unknown as OcppRemoteStartService,
    );
  });

  it('creates an active session and returns an accepted StartTransaction response', async () => {
    prismaMock.connector.findFirst.mockResolvedValue({ id: 'connector-1' });
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
    prismaMock.session.create.mockResolvedValue({ id: 'session-1' });
    remoteStartServiceMock.linkTransactionIdToTrackedRemoteStart.mockReturnValue(null);

    const response = await service.handleStartTransaction('ev-armenia-001', buildStartPayload());

    expect(response.idTagInfo.status).toBe('Accepted');
    expect(response.transactionId).toBeGreaterThan(0);
    expect(prismaMock.session.create).toHaveBeenCalledWith({
      data: {
        connectorId: 'connector-1',
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

  it('completes a session on StopTransaction and stores final cost from pricing calculation', async () => {
    prismaMock.session.findFirst.mockResolvedValue({
      connectorId: 'connector-1',
      createdAt: new Date('2026-02-17T11:59:55.000Z'),
      id: 'session-1',
      startTime: new Date('2026-02-17T12:00:00.000Z'),
      status: SessionStatus.ACTIVE,
      userId: USER_ID,
    });
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
    expect(notificationsServiceMock.sendSessionCompletedNotification).toHaveBeenCalledWith({
      sessionId: 'session-1',
      totalCostAmd: 3900,
      userId: USER_ID,
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
    prismaMock.session.findFirst.mockResolvedValue({
      connectorId: 'connector-1',
      createdAt: new Date('2026-02-17T11:59:55.000Z'),
      id: 'session-1',
      startTime: new Date('2026-02-17T12:00:00.000Z'),
      status: SessionStatus.ACTIVE,
      userId: USER_ID,
    });
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
