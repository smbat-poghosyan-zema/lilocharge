import { SessionStatus as SharedSessionStatus } from '@lilocharge/shared-types';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SessionStatus as PrismaSessionStatus } from '@prisma/client';

import type { NotificationsService } from '../notifications/notifications.service';
import type { PaymentsService } from '../payments/payments.service';
import type { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from './sessions.service';

interface SessionRecord {
  readonly connectorId: string | null;
  readonly createdAt: Date;
  readonly endTime: Date | null;
  readonly energyDelivered: number;
  readonly id: string;
  readonly peakPower: number;
  readonly startTime: Date | null;
  readonly status: PrismaSessionStatus;
  readonly totalCost: number;
  readonly transactionId: string | null;
  readonly updatedAt: Date;
  readonly userId: string;
  readonly vehicleId: string | null;
}

interface PrismaConnectorDelegateMock {
  readonly findUnique: jest.Mock<Promise<{ readonly id: string } | null>, [unknown]>;
}

interface PrismaSessionDelegateMock {
  readonly count: jest.Mock<Promise<number>, [unknown]>;
  readonly create: jest.Mock<Promise<SessionRecord>, [unknown]>;
  readonly findFirst: jest.Mock<Promise<SessionRecord | null>, [unknown]>;
  readonly findMany: jest.Mock<Promise<SessionRecord[]>, [unknown]>;
  readonly update: jest.Mock<Promise<SessionRecord>, [unknown]>;
}

interface PrismaUserDelegateMock {
  readonly findUnique: jest.Mock<Promise<{ readonly id: string } | null>, [unknown]>;
}

interface PrismaVehicleDelegateMock {
  readonly findFirst: jest.Mock<Promise<{ readonly id: string } | null>, [unknown]>;
}

interface PrismaPaymentDelegateMock {
  create: jest.Mock;
}

interface PrismaPaymentMethodDelegateMock {
  readonly findFirst: jest.Mock<Promise<{ readonly id: string } | null>, [unknown]>;
}

interface PrismaServiceMock {
  readonly connector: PrismaConnectorDelegateMock;
  payment?: PrismaPaymentDelegateMock;
  readonly paymentMethod: PrismaPaymentMethodDelegateMock;
  readonly session: PrismaSessionDelegateMock;
  readonly user: PrismaUserDelegateMock;
  readonly vehicle: PrismaVehicleDelegateMock;
}

interface PaymentsServiceMock extends Pick<
  PaymentsService,
  | 'captureAuthorizedPaymentForSession'
  | 'preAuthorizeArcaForSession'
  | 'refundPaymentForSessionFailure'
> {
  readonly captureAuthorizedPaymentForSession: jest.Mock<
    ReturnType<PaymentsService['captureAuthorizedPaymentForSession']>,
    Parameters<PaymentsService['captureAuthorizedPaymentForSession']>
  >;
  readonly preAuthorizeArcaForSession: jest.Mock<
    ReturnType<PaymentsService['preAuthorizeArcaForSession']>,
    Parameters<PaymentsService['preAuthorizeArcaForSession']>
  >;
  readonly refundPaymentForSessionFailure: jest.Mock<
    ReturnType<PaymentsService['refundPaymentForSessionFailure']>,
    Parameters<PaymentsService['refundPaymentForSessionFailure']>
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

const CONNECTOR_ID = '33333333-3333-3333-3333-333333333333';
const SESSION_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const VEHICLE_ID = '44444444-4444-4444-4444-444444444444';

/** Builds one full session record fixture with optional field overrides. */
function buildSessionRecord(overrides?: Partial<SessionRecord>): SessionRecord {
  const now = new Date('2026-02-17T12:00:00.000Z');

  return {
    connectorId: CONNECTOR_ID,
    createdAt: now,
    endTime: null,
    energyDelivered: 0,
    id: SESSION_ID,
    peakPower: 0,
    startTime: null,
    status: PrismaSessionStatus.PENDING,
    totalCost: 0,
    transactionId: null,
    updatedAt: now,
    userId: USER_ID,
    vehicleId: VEHICLE_ID,
    ...overrides,
  };
}

describe('SessionsService', () => {
  let notificationsServiceMock: NotificationsServiceMock;
  let paymentsServiceMock: PaymentsServiceMock;
  let prismaMock: PrismaServiceMock;
  let service: SessionsService;

  beforeEach(() => {
    prismaMock = {
      connector: {
        findUnique: jest.fn<Promise<{ readonly id: string } | null>, [unknown]>(),
      },
      paymentMethod: {
        findFirst: jest
          .fn<Promise<{ readonly id: string } | null>, [unknown]>()
          .mockResolvedValue(null),
      },
      session: {
        count: jest.fn<Promise<number>, [unknown]>(),
        create: jest.fn<Promise<SessionRecord>, [unknown]>(),
        findFirst: jest.fn<Promise<SessionRecord | null>, [unknown]>(),
        findMany: jest.fn<Promise<SessionRecord[]>, [unknown]>(),
        update: jest.fn<Promise<SessionRecord>, [unknown]>(),
      },
      user: {
        findUnique: jest.fn<Promise<{ readonly id: string } | null>, [unknown]>(),
      },
      vehicle: {
        findFirst: jest.fn<Promise<{ readonly id: string } | null>, [unknown]>(),
      },
    };
    paymentsServiceMock = {
      captureAuthorizedPaymentForSession: jest.fn<
        ReturnType<PaymentsService['captureAuthorizedPaymentForSession']>,
        Parameters<PaymentsService['captureAuthorizedPaymentForSession']>
      >(),
      preAuthorizeArcaForSession: jest.fn<
        ReturnType<PaymentsService['preAuthorizeArcaForSession']>,
        Parameters<PaymentsService['preAuthorizeArcaForSession']>
      >(),
      refundPaymentForSessionFailure: jest.fn<
        ReturnType<PaymentsService['refundPaymentForSessionFailure']>,
        Parameters<PaymentsService['refundPaymentForSessionFailure']>
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

    const walletServiceMock = {
      deductBalance: jest.fn(),
      getOrCreateWallet: jest.fn(),
    };

    service = new SessionsService(
      prismaMock as unknown as PrismaService,
      paymentsServiceMock as unknown as PaymentsService,
      notificationsServiceMock as unknown as NotificationsService,
      walletServiceMock as never,
    );
  });

  it('creates a pending session after validating user, connector, and vehicle references', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
    prismaMock.vehicle.findFirst.mockResolvedValue({ id: VEHICLE_ID });
    prismaMock.connector.findUnique.mockResolvedValue({ id: CONNECTOR_ID });
    prismaMock.session.create.mockResolvedValue(buildSessionRecord());

    const session = await service.createSession(USER_ID, {
      connectorId: CONNECTOR_ID,
      vehicleId: VEHICLE_ID,
    });

    expect(session).toEqual({
      connectorId: CONNECTOR_ID,
      createdAt: '2026-02-17T12:00:00.000Z',
      endTime: null,
      energyDelivered: 0,
      id: SESSION_ID,
      peakPower: 0,
      startTime: null,
      status: SharedSessionStatus.PENDING,
      totalCost: 0,
      transactionId: null,
      updatedAt: '2026-02-17T12:00:00.000Z',
      userId: USER_ID,
      vehicleId: VEHICLE_ID,
    });
    expect(prismaMock.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          connectorId: CONNECTOR_ID,
          status: PrismaSessionStatus.PENDING,
          userId: USER_ID,
          vehicleId: VEHICLE_ID,
        },
      }),
    );
  });

  it('rejects session creation when the user id does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(
      service.createSession(USER_ID, {
        connectorId: CONNECTOR_ID,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.session.create).not.toHaveBeenCalled();
  });

  it('rejects session creation when vehicle is not owned by the user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
    prismaMock.vehicle.findFirst.mockResolvedValue(null);

    await expect(
      service.createSession(USER_ID, {
        vehicleId: VEHICLE_ID,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.session.create).not.toHaveBeenCalled();
  });

  it('starts a pending session by transitioning through authorized into active', async () => {
    prismaMock.session.findFirst.mockResolvedValue(
      buildSessionRecord({
        status: PrismaSessionStatus.PENDING,
      }),
    );
    prismaMock.session.update
      .mockResolvedValueOnce(
        buildSessionRecord({
          status: PrismaSessionStatus.AUTHORIZED,
        }),
      )
      .mockResolvedValueOnce(
        buildSessionRecord({
          startTime: new Date('2026-02-17T12:05:00.000Z'),
          status: PrismaSessionStatus.ACTIVE,
        }),
      );

    const session = await service.startSession(USER_ID, SESSION_ID, {
      startedAt: '2026-02-17T12:05:00.000Z',
    });

    expect(session.status).toBe(SharedSessionStatus.ACTIVE);
    expect(session.startTime).toBe('2026-02-17T12:05:00.000Z');
    expect(prismaMock.session.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: {
          status: PrismaSessionStatus.AUTHORIZED,
        },
        where: {
          id: SESSION_ID,
        },
      }),
    );
    expect(prismaMock.session.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: {
          startTime: new Date('2026-02-17T12:05:00.000Z'),
          status: PrismaSessionStatus.ACTIVE,
        },
        where: {
          id: SESSION_ID,
        },
      }),
    );
    expect(paymentsServiceMock.preAuthorizeArcaForSession).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      userId: USER_ID,
    });
    expect(notificationsServiceMock.sendSessionStartedNotification).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      userId: USER_ID,
    });
  });

  it('starts an authorized session directly into active state', async () => {
    prismaMock.session.findFirst.mockResolvedValue(
      buildSessionRecord({
        status: PrismaSessionStatus.AUTHORIZED,
      }),
    );
    prismaMock.session.update.mockResolvedValue(
      buildSessionRecord({
        startTime: new Date('2026-02-17T12:00:10.000Z'),
        status: PrismaSessionStatus.ACTIVE,
      }),
    );

    const session = await service.startSession(USER_ID, SESSION_ID, {});

    expect(session.status).toBe(SharedSessionStatus.ACTIVE);
    expect(prismaMock.session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          startTime: expect.any(Date) as Date,
          status: PrismaSessionStatus.ACTIVE,
        },
      }),
    );
    expect(paymentsServiceMock.preAuthorizeArcaForSession).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      userId: USER_ID,
    });
    expect(notificationsServiceMock.sendSessionStartedNotification).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      userId: USER_ID,
    });
  });

  it('rejects session start when lifecycle transition is invalid', async () => {
    prismaMock.session.findFirst.mockResolvedValue(
      buildSessionRecord({
        status: PrismaSessionStatus.COMPLETED,
      }),
    );

    await expect(service.startSession(USER_ID, SESSION_ID, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prismaMock.session.update).not.toHaveBeenCalled();
    expect(paymentsServiceMock.preAuthorizeArcaForSession).not.toHaveBeenCalled();
    expect(notificationsServiceMock.sendSessionStartedNotification).not.toHaveBeenCalled();
  });

  it('stops an active session by transitioning it into completed state', async () => {
    prismaMock.session.findFirst.mockResolvedValue(
      buildSessionRecord({
        startTime: new Date('2026-02-17T12:05:00.000Z'),
        status: PrismaSessionStatus.ACTIVE,
      }),
    );
    prismaMock.session.update.mockResolvedValue(
      buildSessionRecord({
        endTime: new Date('2026-02-17T12:35:00.000Z'),
        startTime: new Date('2026-02-17T12:05:00.000Z'),
        status: PrismaSessionStatus.COMPLETED,
      }),
    );

    const session = await service.stopSession(USER_ID, SESSION_ID, {
      endedAt: '2026-02-17T12:35:00.000Z',
    });

    expect(session.status).toBe(SharedSessionStatus.COMPLETED);
    expect(session.endTime).toBe('2026-02-17T12:35:00.000Z');
    expect(prismaMock.session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          endTime: new Date('2026-02-17T12:35:00.000Z'),
          status: PrismaSessionStatus.COMPLETED,
        },
        where: {
          id: SESSION_ID,
        },
      }),
    );
    expect(paymentsServiceMock.captureAuthorizedPaymentForSession).toHaveBeenCalledWith({
      amount: 0,
      sessionId: SESSION_ID,
    });
    expect(notificationsServiceMock.sendSessionCompletedNotification).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      totalCostAmd: 0,
      userId: USER_ID,
    });
  });

  it('rejects stop when provided end timestamp is before session start time', async () => {
    prismaMock.session.findFirst.mockResolvedValue(
      buildSessionRecord({
        startTime: new Date('2026-02-17T12:05:00.000Z'),
        status: PrismaSessionStatus.ACTIVE,
      }),
    );

    await expect(
      service.stopSession(USER_ID, SESSION_ID, {
        endedAt: '2026-02-17T12:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prismaMock.session.update).not.toHaveBeenCalled();
    expect(paymentsServiceMock.captureAuthorizedPaymentForSession).not.toHaveBeenCalled();
    expect(notificationsServiceMock.sendSessionCompletedNotification).not.toHaveBeenCalled();
  });

  it('throws not found when start or stop targets a missing user session', async () => {
    prismaMock.session.findFirst.mockResolvedValue(null);

    await expect(service.startSession(USER_ID, SESSION_ID, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.stopSession(USER_ID, SESSION_ID, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(paymentsServiceMock.preAuthorizeArcaForSession).not.toHaveBeenCalled();
    expect(paymentsServiceMock.captureAuthorizedPaymentForSession).not.toHaveBeenCalled();
    expect(notificationsServiceMock.sendSessionStartedNotification).not.toHaveBeenCalled();
    expect(notificationsServiceMock.sendSessionCompletedNotification).not.toHaveBeenCalled();
  });

  describe('getSessionHistory', () => {
    it('returns paginated session history for a user', async () => {
      const session1 = buildSessionRecord({
        id: 'session-1',
        status: PrismaSessionStatus.COMPLETED,
        startTime: new Date('2026-02-17T10:00:00Z'),
        endTime: new Date('2026-02-17T11:00:00Z'),
        energyDelivered: 25.5,
        totalCost: 5000,
      });
      const session2 = buildSessionRecord({
        id: 'session-2',
        status: PrismaSessionStatus.ACTIVE,
        startTime: new Date('2026-02-17T12:00:00Z'),
        energyDelivered: 10.2,
      });

      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaMock.session.findMany.mockResolvedValue([session1, session2] as never);
      prismaMock.session.count.mockResolvedValue(2);

      const result = await service.getSessionHistory(USER_ID, { page: 1, limit: 20 });

      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
      expect(result.sessions).toHaveLength(2);
      expect(result.sessions[0]?.id).toBe('session-1');
      expect(result.sessions[1]?.id).toBe('session-2');
      expect(prismaMock.session.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          connector: {
            include: {
              station: {
                select: {
                  name: true,
                  address: true,
                },
              },
            },
          },
        },
      });
    });

    it('applies status filter when provided', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaMock.session.findMany.mockResolvedValue([]);
      prismaMock.session.count.mockResolvedValue(0);

      await service.getSessionHistory(USER_ID, { status: SharedSessionStatus.COMPLETED });

      expect(prismaMock.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: PrismaSessionStatus.COMPLETED,
          }) as Record<string, unknown>,
        }) as Record<string, unknown>,
      );
    });

    it('applies date range filter when provided', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: USER_ID });
      prismaMock.session.findMany.mockResolvedValue([]);
      prismaMock.session.count.mockResolvedValue(0);

      const startDate = '2026-02-01T00:00:00Z';
      const endDate = '2026-02-17T23:59:59Z';

      await service.getSessionHistory(USER_ID, { startDate, endDate });

      expect(prismaMock.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          }) as Record<string, unknown>,
        }) as Record<string, unknown>,
      );
    });

    it('throws not found when user does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.getSessionHistory(USER_ID, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prismaMock.session.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getSessionById', () => {
    it('returns a single session by id', async () => {
      const session = buildSessionRecord({
        status: PrismaSessionStatus.COMPLETED,
        startTime: new Date('2026-02-17T10:00:00Z'),
        endTime: new Date('2026-02-17T11:00:00Z'),
        energyDelivered: 25.5,
        totalCost: 5000,
      });

      prismaMock.session.findFirst.mockResolvedValue(session);

      const result = await service.getSessionById(USER_ID, SESSION_ID);

      expect(result.id).toBe(SESSION_ID);
      expect(result.userId).toBe(USER_ID);
      expect(result.status).toBe(SharedSessionStatus.COMPLETED);
      expect(result.energyDelivered).toBe(25.5);
      expect(result.totalCost).toBe(5000);
    });

    it('throws not found when session does not exist', async () => {
      prismaMock.session.findFirst.mockResolvedValue(null);

      await expect(service.getSessionById(USER_ID, SESSION_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('generateSessionReceipt', () => {
    it('generates PDF receipt for completed session', async () => {
      const startTime = new Date('2026-02-17T10:00:00Z');
      const endTime = new Date('2026-02-17T11:30:00Z');
      const session = {
        id: SESSION_ID,
        userId: USER_ID,
        status: PrismaSessionStatus.COMPLETED,
        startTime,
        endTime,
        energyDelivered: 25.5,
        peakPower: 50,
        totalCost: 5000,
        connector: {
          connectorType: 'TYPE_2',
          powerKw: 50,
          station: {
            name: 'Test Station',
            address: '123 Test St',
          },
        },
        user: {
          displayName: 'Test User',
          email: 'test@example.com',
        },
      };

      prismaMock.session.findFirst.mockResolvedValue(session as never);

      const result = await service.generateSessionReceipt(USER_ID, SESSION_ID);

      expect(result).toBeDefined();
      expect(result.options?.type).toBe('application/pdf');
    });

    it('throws not found when session does not exist', async () => {
      prismaMock.session.findFirst.mockResolvedValue(null);

      await expect(service.generateSessionReceipt(USER_ID, SESSION_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws bad request when session is not completed', async () => {
      const session = {
        id: SESSION_ID,
        userId: USER_ID,
        status: PrismaSessionStatus.ACTIVE,
        startTime: new Date(),
        endTime: null,
      };

      prismaMock.session.findFirst.mockResolvedValue(session as never);

      await expect(service.generateSessionReceipt(USER_ID, SESSION_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws bad request when session has no start or end time', async () => {
      const session = {
        id: SESSION_ID,
        userId: USER_ID,
        status: PrismaSessionStatus.COMPLETED,
        startTime: null,
        endTime: null,
      };

      prismaMock.session.findFirst.mockResolvedValue(session as never);

      await expect(service.generateSessionReceipt(USER_ID, SESSION_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('wallet payment flow', () => {
    let walletServiceMock: {
      checkSufficientBalance: jest.Mock;
      deductBalance: jest.Mock;
    };

    beforeEach(() => {
      walletServiceMock = {
        checkSufficientBalance: jest.fn(),
        deductBalance: jest.fn(),
      };

      service = new SessionsService(
        prismaMock as unknown as PrismaService,
        paymentsServiceMock as unknown as PaymentsService,
        notificationsServiceMock as unknown as NotificationsService,
        walletServiceMock as never,
      );
    });

    it('should check wallet balance before starting session with wallet payment', async () => {
      const pendingSession = buildSessionRecord({ status: PrismaSessionStatus.PENDING });
      const authorizedSession = buildSessionRecord({ status: PrismaSessionStatus.AUTHORIZED });
      const activeSession = buildSessionRecord({
        status: PrismaSessionStatus.ACTIVE,
        startTime: new Date('2026-02-17T12:00:00.000Z'),
      });

      prismaMock.session.findFirst.mockResolvedValue(pendingSession);
      prismaMock.session.update
        .mockResolvedValueOnce(authorizedSession)
        .mockResolvedValueOnce(activeSession);
      prismaMock.paymentMethod.findFirst.mockResolvedValue({ id: 'wallet-pm-id' });
      walletServiceMock.checkSufficientBalance.mockResolvedValue(true);

      const result = await service.startSession(USER_ID, SESSION_ID, {});

      expect(walletServiceMock.checkSufficientBalance).toHaveBeenCalledWith(
        USER_ID,
        expect.any(Number),
      );
      expect(paymentsServiceMock.preAuthorizeArcaForSession).not.toHaveBeenCalled();
      expect(result.status).toBe(SharedSessionStatus.ACTIVE);
    });

    it('should reject session start when wallet has insufficient balance', async () => {
      const pendingSession = buildSessionRecord({ status: PrismaSessionStatus.PENDING });
      const authorizedSession = buildSessionRecord({ status: PrismaSessionStatus.AUTHORIZED });

      prismaMock.session.findFirst.mockResolvedValue(pendingSession);
      prismaMock.session.update.mockResolvedValue(authorizedSession);
      prismaMock.paymentMethod.findFirst.mockResolvedValue({ id: 'wallet-pm-id' });
      walletServiceMock.checkSufficientBalance.mockResolvedValue(false);

      await expect(service.startSession(USER_ID, SESSION_ID, {})).rejects.toThrow(
        BadRequestException,
      );
      expect(walletServiceMock.checkSufficientBalance).toHaveBeenCalled();
    });

    it('should deduct from wallet and create payment record on session stop', async () => {
      const activeSession = buildSessionRecord({
        status: PrismaSessionStatus.ACTIVE,
        startTime: new Date('2026-02-17T12:00:00.000Z'),
      });
      const completedSession = buildSessionRecord({
        status: PrismaSessionStatus.COMPLETED,
        startTime: new Date('2026-02-17T12:00:00.000Z'),
        endTime: new Date('2026-02-17T13:00:00.000Z'),
        totalCost: 5000,
      });

      prismaMock.session.findFirst.mockResolvedValue(activeSession);
      prismaMock.session.update.mockResolvedValue(completedSession);
      prismaMock.paymentMethod.findFirst.mockResolvedValue({ id: 'wallet-pm-id' });
      prismaMock.payment = { create: jest.fn().mockResolvedValue({ id: 'payment-id' }) };
      walletServiceMock.deductBalance.mockResolvedValue({
        id: 'txn-id',
        amount: 5000,
      });

      const result = await service.stopSession(USER_ID, SESSION_ID, {});

      expect(walletServiceMock.deductBalance).toHaveBeenCalledWith({
        amount: 5000,
        sessionId: SESSION_ID,
        userId: USER_ID,
      });
      expect(prismaMock.payment?.create).toHaveBeenCalled();
      expect(paymentsServiceMock.captureAuthorizedPaymentForSession).not.toHaveBeenCalled();
      expect(result.status).toBe(SharedSessionStatus.COMPLETED);
    });

    it('should use gateway payment when wallet is not set as default', async () => {
      const pendingSession = buildSessionRecord({ status: PrismaSessionStatus.PENDING });
      const authorizedSession = buildSessionRecord({ status: PrismaSessionStatus.AUTHORIZED });
      const activeSession = buildSessionRecord({
        status: PrismaSessionStatus.ACTIVE,
        startTime: new Date('2026-02-17T12:00:00.000Z'),
      });

      prismaMock.session.findFirst.mockResolvedValue(pendingSession);
      prismaMock.session.update
        .mockResolvedValueOnce(authorizedSession)
        .mockResolvedValueOnce(activeSession);
      prismaMock.paymentMethod.findFirst.mockResolvedValue(null); // No wallet payment method

      await service.startSession(USER_ID, SESSION_ID, {});

      expect(paymentsServiceMock.preAuthorizeArcaForSession).toHaveBeenCalledWith({
        sessionId: SESSION_ID,
        userId: USER_ID,
      });
      expect(walletServiceMock.checkSufficientBalance).not.toHaveBeenCalled();
    });
  });
});
