import { BadRequestException } from '@nestjs/common';
import { PaymentGateway, PaymentStatus } from '@prisma/client';

import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ApplePayClient } from './apple-pay.client';
import type { ArcaClient } from './arca.client';
import type { GooglePayClient } from './google-pay.client';
import type { IdramClient } from './idram.client';
import { PaymentsService } from './payments.service';

interface PaymentMethodRecord {
  readonly gateway: PaymentGateway;
  readonly id: string;
  readonly token: string;
}

interface PaymentRecord {
  readonly amount: number;
  readonly authorizedAmount: number;
  readonly capturedAmount: number;
  readonly captureIdempotencyKey: string | null;
  readonly gateway: PaymentGateway;
  readonly gatewayTransactionId: string | null;
  readonly id: string;
  readonly paymentMethodId: string;
  readonly preauthIdempotencyKey: string | null;
  readonly refundIdempotencyKey: string | null;
  readonly sessionId: string;
  readonly status: PaymentStatus;
  readonly userId: string;
}

interface PrismaPaymentMethodDelegateMock {
  create: jest.Mock;
  findFirst: jest.Mock<Promise<PaymentMethodRecord | null>, [unknown]>;
  findUnique: jest.Mock<Promise<PaymentMethodRecord | null>, [unknown]>;
  update: jest.Mock;
  updateMany: jest.Mock;
}

interface PrismaPaymentDelegateMock {
  readonly create: jest.Mock<Promise<PaymentRecord>, [unknown]>;
  readonly findUnique: jest.Mock<Promise<PaymentRecord | null>, [unknown]>;
  readonly update: jest.Mock<Promise<{ readonly id: string }>, [unknown]>;
  readonly updateMany: jest.Mock<Promise<{ readonly count: number }>, [unknown]>;
}

interface PrismaServiceMock {
  readonly payment: PrismaPaymentDelegateMock;
  readonly paymentMethod: PrismaPaymentMethodDelegateMock;
}

interface ArcaClientMock extends Pick<ArcaClient, 'capture' | 'preAuthorize' | 'refund'> {
  readonly capture: jest.Mock<ReturnType<ArcaClient['capture']>, Parameters<ArcaClient['capture']>>;
  readonly preAuthorize: jest.Mock<
    ReturnType<ArcaClient['preAuthorize']>,
    Parameters<ArcaClient['preAuthorize']>
  >;
  readonly refund: jest.Mock<ReturnType<ArcaClient['refund']>, Parameters<ArcaClient['refund']>>;
}

interface IdramClientMock extends Pick<IdramClient, 'debitWallet' | 'getBalance' | 'refund'> {
  readonly debitWallet: jest.Mock<
    ReturnType<IdramClient['debitWallet']>,
    Parameters<IdramClient['debitWallet']>
  >;
  readonly getBalance: jest.Mock<
    ReturnType<IdramClient['getBalance']>,
    Parameters<IdramClient['getBalance']>
  >;
  readonly refund: jest.Mock<ReturnType<IdramClient['refund']>, Parameters<IdramClient['refund']>>;
}

interface ApplePayClientMock extends Pick<ApplePayClient, 'exchangeToken'> {
  readonly exchangeToken: jest.Mock<
    ReturnType<ApplePayClient['exchangeToken']>,
    Parameters<ApplePayClient['exchangeToken']>
  >;
}

interface GooglePayClientMock extends Pick<GooglePayClient, 'exchangeToken'> {
  readonly exchangeToken: jest.Mock<
    ReturnType<GooglePayClient['exchangeToken']>,
    Parameters<GooglePayClient['exchangeToken']>
  >;
}

interface NotificationsServiceMock extends Pick<
  NotificationsService,
  'sendPaymentFailedNotification' | 'sendPaymentSucceededNotification'
> {
  readonly sendPaymentFailedNotification: jest.Mock<
    ReturnType<NotificationsService['sendPaymentFailedNotification']>,
    Parameters<NotificationsService['sendPaymentFailedNotification']>
  >;
  readonly sendPaymentSucceededNotification: jest.Mock<
    ReturnType<NotificationsService['sendPaymentSucceededNotification']>,
    Parameters<NotificationsService['sendPaymentSucceededNotification']>
  >;
}

const SESSION_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '11111111-1111-1111-1111-111111111111';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Builds one payment record fixture for deterministic payment-service unit tests. */
function buildPaymentRecord(overrides?: Partial<PaymentRecord>): PaymentRecord {
  return {
    amount: 5000,
    authorizedAmount: 5000,
    capturedAmount: 0,
    captureIdempotencyKey: null,
    gateway: PaymentGateway.ARCA,
    gatewayTransactionId: 'arca-tx-1',
    id: 'payment-1',
    paymentMethodId: 'payment-method-1',
    preauthIdempotencyKey: null,
    refundIdempotencyKey: null,
    sessionId: SESSION_ID,
    status: PaymentStatus.AUTHORIZED,
    userId: USER_ID,
    ...overrides,
  };
}

describe('PaymentsService', () => {
  let applePayClientMock: ApplePayClientMock;
  let arcaClientMock: ArcaClientMock;
  let googlePayClientMock: GooglePayClientMock;
  let idramClientMock: IdramClientMock;
  let notificationsServiceMock: NotificationsServiceMock;
  let prismaMock: PrismaServiceMock;
  let service: PaymentsService;

  beforeEach(() => {
    prismaMock = {
      payment: {
        create: jest.fn<Promise<PaymentRecord>, [unknown]>(),
        findUnique: jest.fn<Promise<PaymentRecord | null>, [unknown]>(),
        update: jest.fn<Promise<{ readonly id: string }>, [unknown]>(),
        updateMany: jest.fn<Promise<{ readonly count: number }>, [unknown]>(),
      },
      paymentMethod: {
        create: jest.fn(),
        findFirst: jest.fn<Promise<PaymentMethodRecord | null>, [unknown]>(),
        findUnique: jest.fn<Promise<PaymentMethodRecord | null>, [unknown]>(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    arcaClientMock = {
      capture: jest.fn<ReturnType<ArcaClient['capture']>, Parameters<ArcaClient['capture']>>(),
      preAuthorize: jest.fn<
        ReturnType<ArcaClient['preAuthorize']>,
        Parameters<ArcaClient['preAuthorize']>
      >(),
      refund: jest.fn<ReturnType<ArcaClient['refund']>, Parameters<ArcaClient['refund']>>(),
    };
    idramClientMock = {
      debitWallet: jest.fn<
        ReturnType<IdramClient['debitWallet']>,
        Parameters<IdramClient['debitWallet']>
      >(),
      getBalance: jest.fn<
        ReturnType<IdramClient['getBalance']>,
        Parameters<IdramClient['getBalance']>
      >(),
      refund: jest.fn<ReturnType<IdramClient['refund']>, Parameters<IdramClient['refund']>>(),
    };
    applePayClientMock = {
      exchangeToken: jest.fn<
        ReturnType<ApplePayClient['exchangeToken']>,
        Parameters<ApplePayClient['exchangeToken']>
      >(),
    };
    googlePayClientMock = {
      exchangeToken: jest.fn<
        ReturnType<GooglePayClient['exchangeToken']>,
        Parameters<GooglePayClient['exchangeToken']>
      >(),
    };
    notificationsServiceMock = {
      sendPaymentFailedNotification: jest.fn<
        ReturnType<NotificationsService['sendPaymentFailedNotification']>,
        Parameters<NotificationsService['sendPaymentFailedNotification']>
      >(),
      sendPaymentSucceededNotification: jest.fn<
        ReturnType<NotificationsService['sendPaymentSucceededNotification']>,
        Parameters<NotificationsService['sendPaymentSucceededNotification']>
      >(),
    };
    service = new PaymentsService(
      prismaMock as unknown as PrismaService,
      notificationsServiceMock as unknown as NotificationsService,
      arcaClientMock as unknown as ArcaClient,
      idramClientMock as unknown as IdramClient,
      applePayClientMock as unknown as ApplePayClient,
      googlePayClientMock as unknown as GooglePayClient,
    );
  });

  it('pre-authorizes one ArCa session, persisting the key on a PENDING row before the gateway call', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(null);
    prismaMock.paymentMethod.findFirst.mockResolvedValue({
      gateway: PaymentGateway.ARCA,
      id: 'payment-method-1',
      token: 'card-token-1',
    });
    arcaClientMock.preAuthorize.mockResolvedValue({
      gatewayTransactionId: 'arca-tx-1',
    });
    // The create mock echoes the persisted pre-auth key back like the database would.
    prismaMock.payment.create.mockImplementation((args: unknown) => {
      const { data } = args as { data: { preauthIdempotencyKey: string } };
      return Promise.resolve(
        buildPaymentRecord({
          authorizedAmount: 0,
          gatewayTransactionId: null,
          preauthIdempotencyKey: data.preauthIdempotencyKey,
          status: PaymentStatus.PENDING,
        }),
      );
    });
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });

    await service.preAuthorizeArcaForSession({
      amount: 6200,
      sessionId: SESSION_ID,
      userId: USER_ID,
    });

    expect(arcaClientMock.preAuthorize).toHaveBeenCalledWith({
      amount: 6200,
      cardToken: 'card-token-1',
      currency: 'AMD',
      description: 'LiloCharge session pre-authorization',
      idempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown as string,
      orderId: SESSION_ID,
    });
    expect(prismaMock.payment.create).toHaveBeenCalledWith({
      data: {
        amount: 6200,
        authorizedAmount: 0,
        capturedAmount: 0,
        gateway: PaymentGateway.ARCA,
        gatewayTransactionId: null,
        paymentMethodId: 'payment-method-1',
        preauthIdempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown as string,
        sessionId: SESSION_ID,
        status: PaymentStatus.PENDING,
        userId: USER_ID,
      },
      select: expect.any(Object) as never,
    });

    // The PENDING row (carrying the key) must be written BEFORE the gateway sees the key.
    const createOrder = prismaMock.payment.create.mock.invocationCallOrder[0] ?? Number.MAX_VALUE;
    const preAuthOrder = arcaClientMock.preAuthorize.mock.invocationCallOrder[0] ?? 0;
    expect(createOrder).toBeLessThan(preAuthOrder);

    const preAuthorizeCallKey = arcaClientMock.preAuthorize.mock.calls[0]?.[0]?.idempotencyKey;
    const createCallData = prismaMock.payment.create.mock.calls[0]?.[0] as {
      readonly data: { readonly preauthIdempotencyKey: string };
    };
    expect(createCallData.data.preauthIdempotencyKey).toBe(preAuthorizeCallKey);

    // Success is a conditional forward-only transition from PENDING/FAILED to AUTHORIZED.
    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
        status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
      },
      data: {
        amount: 6200,
        authorizedAmount: 6200,
        gateway: PaymentGateway.ARCA,
        gatewayTransactionId: 'arca-tx-1',
        paymentMethodId: 'payment-method-1',
        status: PaymentStatus.AUTHORIZED,
      },
    });
    expect(idramClientMock.getBalance).not.toHaveBeenCalled();
    expect(applePayClientMock.exchangeToken).not.toHaveBeenCalled();
    expect(googlePayClientMock.exchangeToken).not.toHaveBeenCalled();
  });

  it('pre-authorizes one Idram session by checking wallet balance', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(null);
    prismaMock.paymentMethod.findFirst.mockResolvedValue({
      gateway: PaymentGateway.IDRAM,
      id: 'payment-method-2',
      token: 'wallet-token-1',
    });
    idramClientMock.getBalance.mockResolvedValue({
      balance: 9100,
    });
    prismaMock.payment.create.mockResolvedValue(
      buildPaymentRecord({
        authorizedAmount: 0,
        gateway: PaymentGateway.IDRAM,
        gatewayTransactionId: null,
        paymentMethodId: 'payment-method-2',
        preauthIdempotencyKey: 'preauth-key-1',
        status: PaymentStatus.PENDING,
      }),
    );
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });

    await service.preAuthorizeArcaForSession({
      amount: 6200,
      sessionId: SESSION_ID,
      userId: USER_ID,
    });

    expect(idramClientMock.getBalance).toHaveBeenCalledWith({
      currency: 'AMD',
      walletToken: 'wallet-token-1',
    });
    expect(prismaMock.payment.create).toHaveBeenCalledWith({
      data: {
        amount: 6200,
        authorizedAmount: 0,
        capturedAmount: 0,
        gateway: PaymentGateway.IDRAM,
        gatewayTransactionId: null,
        paymentMethodId: 'payment-method-2',
        preauthIdempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown as string,
        sessionId: SESSION_ID,
        status: PaymentStatus.PENDING,
        userId: USER_ID,
      },
      select: expect.any(Object) as never,
    });
    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
        status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
      },
      data: {
        amount: 6200,
        authorizedAmount: 6200,
        gateway: PaymentGateway.IDRAM,
        gatewayTransactionId: null,
        paymentMethodId: 'payment-method-2',
        status: PaymentStatus.AUTHORIZED,
      },
    });
    expect(arcaClientMock.preAuthorize).not.toHaveBeenCalled();
  });

  it('reuses the persisted pre-auth key for an existing PENDING payment and claims one when missing', async () => {
    // Existing payment with a persisted key: reuse it, no claim write.
    prismaMock.payment.findUnique.mockResolvedValue(
      buildPaymentRecord({
        preauthIdempotencyKey: 'persisted-preauth-key',
        status: PaymentStatus.PENDING,
      }),
    );
    prismaMock.paymentMethod.findFirst.mockResolvedValue({
      gateway: PaymentGateway.ARCA,
      id: 'payment-method-1',
      token: 'card-token-1',
    });
    arcaClientMock.preAuthorize.mockResolvedValue({
      gatewayTransactionId: 'arca-tx-1',
    });
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });

    await service.preAuthorizeArcaForSession({
      amount: 6200,
      sessionId: SESSION_ID,
      userId: USER_ID,
    });

    expect(arcaClientMock.preAuthorize).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'persisted-preauth-key' }),
    );
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
    expect(prismaMock.payment.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          preauthIdempotencyKey: expect.any(String) as unknown as string,
        }) as unknown as object,
      }),
    );
  });

  it('reuses the winner key when a concurrent pre-auth claims the key first', async () => {
    prismaMock.payment.findUnique
      .mockResolvedValueOnce(
        buildPaymentRecord({
          preauthIdempotencyKey: null,
          status: PaymentStatus.PENDING,
        }),
      )
      // Re-read after the lost conditional claim returns the winner's key.
      .mockResolvedValueOnce(
        buildPaymentRecord({
          preauthIdempotencyKey: 'winner-preauth-key',
          status: PaymentStatus.PENDING,
        }),
      );
    prismaMock.paymentMethod.findFirst.mockResolvedValue({
      gateway: PaymentGateway.ARCA,
      id: 'payment-method-1',
      token: 'card-token-1',
    });
    arcaClientMock.preAuthorize.mockResolvedValue({
      gatewayTransactionId: 'arca-tx-1',
    });
    prismaMock.payment.updateMany
      // The key claim loses the race...
      .mockResolvedValueOnce({ count: 0 })
      // ...while the final AUTHORIZED transition succeeds.
      .mockResolvedValue({ count: 1 });

    await service.preAuthorizeArcaForSession({
      amount: 6200,
      sessionId: SESSION_ID,
      userId: USER_ID,
    });

    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', preauthIdempotencyKey: null },
      data: { preauthIdempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown as string },
    });
    expect(arcaClientMock.preAuthorize).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'winner-preauth-key' }),
    );
  });

  it('keeps pre-authorization idempotent when payment is already authorized', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(buildPaymentRecord());

    await service.preAuthorizeArcaForSession({
      sessionId: SESSION_ID,
      userId: USER_ID,
    });

    expect(prismaMock.paymentMethod.findFirst).not.toHaveBeenCalled();
    expect(arcaClientMock.preAuthorize).not.toHaveBeenCalled();
    expect(idramClientMock.getBalance).not.toHaveBeenCalled();
    expect(prismaMock.payment.create).not.toHaveBeenCalled();
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });

  it('rejects pre-authorization when user has no supported payment method', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(null);
    prismaMock.paymentMethod.findFirst.mockResolvedValue(null);

    await expect(
      service.preAuthorizeArcaForSession({
        sessionId: SESSION_ID,
        userId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(arcaClientMock.preAuthorize).not.toHaveBeenCalled();
    expect(idramClientMock.getBalance).not.toHaveBeenCalled();
  });

  it('rejects Idram pre-authorization when wallet balance is insufficient', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(null);
    prismaMock.paymentMethod.findFirst.mockResolvedValue({
      gateway: PaymentGateway.IDRAM,
      id: 'payment-method-2',
      token: 'wallet-token-1',
    });
    idramClientMock.getBalance.mockResolvedValue({
      balance: 1000,
    });
    // The durable PENDING row is written before the gateway balance check by design.
    prismaMock.payment.create.mockResolvedValue(
      buildPaymentRecord({
        authorizedAmount: 0,
        gateway: PaymentGateway.IDRAM,
        gatewayTransactionId: null,
        preauthIdempotencyKey: 'preauth-key-1',
        status: PaymentStatus.PENDING,
      }),
    );

    await expect(
      service.preAuthorizeArcaForSession({
        amount: 6200,
        sessionId: SESSION_ID,
        userId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // The payment record never advances to AUTHORIZED when the gateway check fails.
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
    expect(prismaMock.payment.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PaymentStatus.AUTHORIZED }) as unknown as object,
      }),
    );
  });

  it('captures an authorized ArCa payment for one session total', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(
      buildPaymentRecord({
        capturedAmount: 0,
        status: PaymentStatus.AUTHORIZED,
      }),
    );
    arcaClientMock.capture.mockResolvedValue({
      gatewayTransactionId: 'arca-tx-1',
    });
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });

    await service.captureAuthorizedPaymentForSession({
      amount: 3900,
      sessionId: SESSION_ID,
    });

    expect(arcaClientMock.capture).toHaveBeenCalledWith({
      amount: 3900,
      gatewayTransactionId: 'arca-tx-1',
      idempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown as string,
    });
    // The capture key is claimed conditionally (only where no key exists yet).
    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
        captureIdempotencyKey: null,
      },
      data: {
        captureIdempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown as string,
      },
    });
    // The CAPTURED transition is conditional so a terminal REFUNDED can never be overwritten.
    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
        status: {
          in: [
            PaymentStatus.PENDING,
            PaymentStatus.AUTHORIZED,
            PaymentStatus.CAPTURED,
            PaymentStatus.FAILED,
          ],
        },
      },
      data: {
        amount: 3900,
        capturedAmount: 3900,
        status: PaymentStatus.CAPTURED,
      },
    });
    expect(idramClientMock.debitWallet).not.toHaveBeenCalled();
    expect(notificationsServiceMock.sendPaymentSucceededNotification).toHaveBeenCalledWith({
      paymentAmountAmd: 3900,
      sessionId: SESSION_ID,
      userId: USER_ID,
    });
  });

  it('preserves a concurrent REFUNDED transition instead of overwriting it with CAPTURED', async () => {
    prismaMock.payment.findUnique
      .mockResolvedValueOnce(
        buildPaymentRecord({
          capturedAmount: 0,
          status: PaymentStatus.AUTHORIZED,
        }),
      )
      // Re-read after the lost conditional write shows a refund webhook won the race.
      .mockResolvedValueOnce(
        buildPaymentRecord({
          status: PaymentStatus.REFUNDED,
        }),
      );
    arcaClientMock.capture.mockResolvedValue({
      gatewayTransactionId: 'arca-tx-1',
    });
    prismaMock.payment.updateMany
      // Key claim succeeds...
      .mockResolvedValueOnce({ count: 1 })
      // ...but the CAPTURED transition loses to the REFUNDED webhook.
      .mockResolvedValueOnce({ count: 0 });

    await service.captureAuthorizedPaymentForSession({
      amount: 3900,
      sessionId: SESSION_ID,
    });

    expect(prismaMock.payment.update).not.toHaveBeenCalled();
    expect(notificationsServiceMock.sendPaymentSucceededNotification).not.toHaveBeenCalled();
  });

  it('reuses the winner capture key when a concurrent capture claims the key first', async () => {
    prismaMock.payment.findUnique
      .mockResolvedValueOnce(
        buildPaymentRecord({
          capturedAmount: 0,
          status: PaymentStatus.AUTHORIZED,
        }),
      )
      .mockResolvedValueOnce(
        buildPaymentRecord({
          captureIdempotencyKey: 'winner-capture-key',
          status: PaymentStatus.AUTHORIZED,
        }),
      );
    arcaClientMock.capture.mockResolvedValue({
      gatewayTransactionId: 'arca-tx-1',
    });
    prismaMock.payment.updateMany
      // The key claim loses the race to a concurrent capture...
      .mockResolvedValueOnce({ count: 0 })
      // ...and the CAPTURED transition still succeeds afterwards.
      .mockResolvedValue({ count: 1 });

    await service.captureAuthorizedPaymentForSession({
      amount: 3900,
      sessionId: SESSION_ID,
    });

    expect(arcaClientMock.capture).toHaveBeenCalledWith({
      amount: 3900,
      gatewayTransactionId: 'arca-tx-1',
      idempotencyKey: 'winner-capture-key',
    });
  });

  it('captures an authorized Idram payment by debiting wallet balance', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(
      buildPaymentRecord({
        gateway: PaymentGateway.IDRAM,
        gatewayTransactionId: null,
        paymentMethodId: 'payment-method-2',
        status: PaymentStatus.AUTHORIZED,
      }),
    );
    prismaMock.paymentMethod.findUnique.mockResolvedValue({
      gateway: PaymentGateway.IDRAM,
      id: 'payment-method-2',
      token: 'wallet-token-1',
    });
    idramClientMock.debitWallet.mockResolvedValue({
      gatewayTransactionId: 'idram-tx-1',
    });
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });

    await service.captureAuthorizedPaymentForSession({
      amount: 3900,
      sessionId: SESSION_ID,
    });

    expect(idramClientMock.debitWallet).toHaveBeenCalledWith({
      amount: 3900,
      currency: 'AMD',
      description: 'LiloCharge session capture',
      idempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown as string,
      orderId: SESSION_ID,
      walletToken: 'wallet-token-1',
    });
    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
        status: {
          in: [
            PaymentStatus.PENDING,
            PaymentStatus.AUTHORIZED,
            PaymentStatus.CAPTURED,
            PaymentStatus.FAILED,
          ],
        },
      },
      data: {
        amount: 3900,
        capturedAmount: 3900,
        gatewayTransactionId: 'idram-tx-1',
        status: PaymentStatus.CAPTURED,
      },
    });
    expect(arcaClientMock.capture).not.toHaveBeenCalled();
    expect(notificationsServiceMock.sendPaymentSucceededNotification).toHaveBeenCalledWith({
      paymentAmountAmd: 3900,
      sessionId: SESSION_ID,
      userId: USER_ID,
    });
  });

  it('does not call gateway capture when amount is zero or payment is absent', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(null);

    await service.captureAuthorizedPaymentForSession({
      amount: 4000,
      sessionId: SESSION_ID,
    });

    prismaMock.payment.findUnique.mockResolvedValue(buildPaymentRecord());

    await service.captureAuthorizedPaymentForSession({
      amount: 0,
      sessionId: SESSION_ID,
    });

    expect(arcaClientMock.capture).not.toHaveBeenCalled();
    expect(idramClientMock.debitWallet).not.toHaveBeenCalled();
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
    expect(prismaMock.payment.updateMany).not.toHaveBeenCalled();
    expect(notificationsServiceMock.sendPaymentSucceededNotification).not.toHaveBeenCalled();
    expect(notificationsServiceMock.sendPaymentFailedNotification).not.toHaveBeenCalled();
  });

  it('sends payment-failed notification when capture fails and rethrows gateway error', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(buildPaymentRecord());
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });
    arcaClientMock.capture.mockRejectedValue(new Error('gateway timeout'));

    await expect(
      service.captureAuthorizedPaymentForSession({
        amount: 3900,
        sessionId: SESSION_ID,
      }),
    ).rejects.toBeInstanceOf(Error);

    expect(notificationsServiceMock.sendPaymentFailedNotification).toHaveBeenCalledWith({
      failureReason: 'gateway timeout',
      sessionId: SESSION_ID,
      userId: USER_ID,
    });
    expect(prismaMock.payment.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PaymentStatus.CAPTURED }) as unknown as object,
      }),
    );
  });

  it('reuses the persisted capture idempotency key when a capture is retried', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(
      buildPaymentRecord({
        captureIdempotencyKey: 'capture-key-1',
      }),
    );
    arcaClientMock.capture.mockResolvedValue({
      gatewayTransactionId: 'arca-tx-1',
    });
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });

    await service.captureAuthorizedPaymentForSession({
      amount: 3900,
      sessionId: SESSION_ID,
    });

    expect(arcaClientMock.capture).toHaveBeenCalledWith({
      amount: 3900,
      gatewayTransactionId: 'arca-tx-1',
      idempotencyKey: 'capture-key-1',
    });
    expect(prismaMock.payment.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          captureIdempotencyKey: expect.any(String) as unknown as string,
        }) as unknown as object,
      }),
    );
  });

  it('rejects gateway capture dispatch for WALLET payments with descriptive invariant error', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(
      buildPaymentRecord({
        capturedAmount: 1000,
        gateway: PaymentGateway.WALLET,
        status: PaymentStatus.CAPTURED,
      }),
    );
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.captureAuthorizedPaymentForSession({
        amount: 3900,
        sessionId: SESSION_ID,
      }),
    ).rejects.toThrow('WALLET payments are settled by WalletService balance deduction');

    expect(arcaClientMock.capture).not.toHaveBeenCalled();
    expect(idramClientMock.debitWallet).not.toHaveBeenCalled();
  });

  it('refunds captured ArCa payments for failed sessions and marks payment as refunded', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(
      buildPaymentRecord({
        capturedAmount: 3800,
        status: PaymentStatus.CAPTURED,
      }),
    );
    arcaClientMock.refund.mockResolvedValue({
      gatewayTransactionId: 'arca-tx-1',
    });
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });

    await service.refundPaymentForSessionFailure(SESSION_ID);

    expect(arcaClientMock.refund).toHaveBeenCalledWith({
      amount: 3800,
      gatewayTransactionId: 'arca-tx-1',
      idempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown as string,
    });
    // The refund key is claimed conditionally before the gateway call.
    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
        refundIdempotencyKey: null,
      },
      data: {
        refundIdempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown as string,
      },
    });
    // The REFUNDED transition is conditional so concurrent refunds are idempotent.
    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
        status: {
          in: [
            PaymentStatus.PENDING,
            PaymentStatus.AUTHORIZED,
            PaymentStatus.CAPTURED,
            PaymentStatus.FAILED,
          ],
        },
      },
      data: {
        status: PaymentStatus.REFUNDED,
      },
    });
    expect(idramClientMock.refund).not.toHaveBeenCalled();
  });

  it('refunds captured Idram payments for failed sessions and marks payment as refunded', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(
      buildPaymentRecord({
        capturedAmount: 3800,
        gateway: PaymentGateway.IDRAM,
        gatewayTransactionId: 'idram-tx-1',
        status: PaymentStatus.CAPTURED,
      }),
    );
    idramClientMock.refund.mockResolvedValue({
      gatewayTransactionId: 'idram-tx-2',
    });
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });

    await service.refundPaymentForSessionFailure(SESSION_ID);

    expect(idramClientMock.refund).toHaveBeenCalledWith({
      amount: 3800,
      gatewayTransactionId: 'idram-tx-1',
      idempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown as string,
    });
    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
        status: {
          in: [
            PaymentStatus.PENDING,
            PaymentStatus.AUTHORIZED,
            PaymentStatus.CAPTURED,
            PaymentStatus.FAILED,
          ],
        },
      },
      data: {
        status: PaymentStatus.REFUNDED,
      },
    });
    expect(arcaClientMock.refund).not.toHaveBeenCalled();
  });

  it('reuses the persisted refund idempotency key when a refund is retried', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(
      buildPaymentRecord({
        capturedAmount: 3800,
        refundIdempotencyKey: 'refund-key-1',
        status: PaymentStatus.CAPTURED,
      }),
    );
    arcaClientMock.refund.mockResolvedValue({
      gatewayTransactionId: 'arca-tx-1',
    });
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });

    await service.refundPaymentForSessionFailure(SESSION_ID);

    expect(arcaClientMock.refund).toHaveBeenCalledWith({
      amount: 3800,
      gatewayTransactionId: 'arca-tx-1',
      idempotencyKey: 'refund-key-1',
    });
    expect(prismaMock.payment.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          refundIdempotencyKey: expect.any(String) as unknown as string,
        }) as unknown as object,
      }),
    );
  });

  it('checks Idram wallet balance for one user using configured wallet token', async () => {
    prismaMock.paymentMethod.findFirst.mockResolvedValue({
      gateway: PaymentGateway.IDRAM,
      id: 'payment-method-2',
      token: 'wallet-token-1',
    });
    idramClientMock.getBalance.mockResolvedValue({
      balance: 8200,
    });

    await expect(service.getIdramWalletBalance(USER_ID)).resolves.toBe(8200);
    expect(idramClientMock.getBalance).toHaveBeenCalledWith({
      currency: 'AMD',
      walletToken: 'wallet-token-1',
    });
  });

  it('skips refund when payment is already refunded', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(
      buildPaymentRecord({
        status: PaymentStatus.REFUNDED,
      }),
    );

    await service.refundPaymentForSessionFailure(SESSION_ID);

    expect(arcaClientMock.refund).not.toHaveBeenCalled();
    expect(idramClientMock.refund).not.toHaveBeenCalled();
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
    expect(prismaMock.payment.updateMany).not.toHaveBeenCalled();
  });

  describe('setWalletAsPaymentMethod', () => {
    it('should create new wallet payment method when none exists', async () => {
      const createdMethod = {
        id: 'wallet-pm-id',
        userId: USER_ID,
        gateway: PaymentGateway.WALLET,
        token: `wallet-${USER_ID}`,
        isDefault: true,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        last4: null,
        expiryMonth: null,
        expiryYear: null,
      };

      prismaMock.paymentMethod.findFirst.mockResolvedValue(null);
      prismaMock.paymentMethod.updateMany = jest.fn().mockResolvedValue({ count: 0 });
      prismaMock.paymentMethod.create = jest.fn().mockResolvedValue(createdMethod);

      const result = await service.setWalletAsPaymentMethod(USER_ID);

      expect(result.gateway).toBe('WALLET');
      expect(result.isDefault).toBe(true);
      expect(prismaMock.paymentMethod.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          gateway: PaymentGateway.WALLET,
          token: `wallet-${USER_ID}`,
          isDefault: true,
        },
        select: expect.any(Object) as never,
      });
    });

    it('should update existing wallet payment method to default', async () => {
      const existingMethod = {
        id: 'wallet-pm-id',
        userId: USER_ID,
        gateway: PaymentGateway.WALLET,
        token: `wallet-${USER_ID}`,
        isDefault: false,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        last4: null,
        expiryMonth: null,
        expiryYear: null,
      };

      const updatedMethod = { ...existingMethod, isDefault: true };

      prismaMock.paymentMethod.findFirst.mockResolvedValue(existingMethod);
      prismaMock.paymentMethod.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      prismaMock.paymentMethod.update = jest.fn().mockResolvedValue(updatedMethod);

      const result = await service.setWalletAsPaymentMethod(USER_ID);

      expect(result.isDefault).toBe(true);
      expect(prismaMock.paymentMethod.update).toHaveBeenCalledWith({
        where: { id: 'wallet-pm-id' },
        data: { isDefault: true },
        select: expect.any(Object) as never,
      });
    });

    it('should clear other default payment methods', async () => {
      prismaMock.paymentMethod.findFirst.mockResolvedValue(null);
      prismaMock.paymentMethod.updateMany = jest.fn().mockResolvedValue({ count: 2 });
      prismaMock.paymentMethod.create = jest.fn().mockResolvedValue({
        id: 'wallet-pm-id',
        userId: USER_ID,
        gateway: PaymentGateway.WALLET,
        token: `wallet-${USER_ID}`,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        last4: null,
        expiryMonth: null,
        expiryYear: null,
      });

      await service.setWalletAsPaymentMethod(USER_ID);

      expect(prismaMock.paymentMethod.updateMany).toHaveBeenCalledWith({
        where: {
          userId: USER_ID,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    });
  });
});
