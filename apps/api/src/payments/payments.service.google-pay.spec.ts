import { PaymentGateway, PaymentStatus } from '@prisma/client';

import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ApplePayClient } from './apple-pay.client';
import type { ArcaClient } from './arca.client';
import type { GooglePayClient } from './google-pay.client';
import type { IdramClient } from './idram.client';
import { PaymentsService } from './payments.service';

interface PaymentMethodRecord {
  readonly createdAt: Date;
  readonly expiryMonth: number | null;
  readonly expiryYear: number | null;
  readonly gateway: PaymentGateway;
  readonly id: string;
  readonly isDefault: boolean;
  readonly last4: string | null;
  readonly token: string;
  readonly updatedAt: Date;
  readonly userId: string;
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
  readonly create: jest.Mock<Promise<PaymentMethodRecord>, [unknown]>;
  readonly findFirst: jest.Mock<Promise<PaymentMethodRecord | null>, [unknown]>;
  readonly findUnique: jest.Mock<Promise<PaymentMethodRecord | null>, [unknown]>;
  readonly update: jest.Mock<Promise<PaymentMethodRecord>, [unknown]>;
  readonly updateMany: jest.Mock<Promise<{ readonly count: number }>, [unknown]>;
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

/**
 * Builds one payment method fixture for deterministic Google Pay service tests.
 */
function buildPaymentMethodRecord(overrides?: Partial<PaymentMethodRecord>): PaymentMethodRecord {
  return {
    createdAt: new Date('2026-02-17T00:00:00.000Z'),
    expiryMonth: null,
    expiryYear: null,
    gateway: PaymentGateway.GOOGLE_PAY,
    id: 'payment-method-1',
    isDefault: true,
    last4: '4242',
    token: 'google-tokenized-card-1',
    updatedAt: new Date('2026-02-17T00:00:00.000Z'),
    userId: USER_ID,
    ...overrides,
  };
}

/**
 * Builds one payment record fixture for deterministic session-payment flow tests.
 */
function buildPaymentRecord(overrides?: Partial<PaymentRecord>): PaymentRecord {
  return {
    amount: 5000,
    authorizedAmount: 5000,
    capturedAmount: 0,
    captureIdempotencyKey: null,
    gateway: PaymentGateway.GOOGLE_PAY,
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

describe('PaymentsService Google Pay flows', () => {
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
        create: jest.fn<Promise<PaymentMethodRecord>, [unknown]>(),
        findFirst: jest.fn<Promise<PaymentMethodRecord | null>, [unknown]>(),
        findUnique: jest.fn<Promise<PaymentMethodRecord | null>, [unknown]>(),
        update: jest.fn<Promise<PaymentMethodRecord>, [unknown]>(),
        updateMany: jest.fn<Promise<{ readonly count: number }>, [unknown]>(),
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

  it('exchanges Google Pay token and stores a default Google Pay payment method', async () => {
    googlePayClientMock.exchangeToken.mockResolvedValue({
      network: 'visa',
      paymentMethodToken: 'google-tokenized-card-1',
    });
    prismaMock.paymentMethod.findFirst.mockResolvedValue(null);
    prismaMock.paymentMethod.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.paymentMethod.create.mockResolvedValue(buildPaymentMethodRecord());

    await expect(
      service.exchangeGooglePayToken(USER_ID, {
        cardLast4: '4242',
        isDefault: true,
        paymentToken: 'google-pay-payment-token',
        transactionIdentifier: 'google-pay-transaction-1',
      }),
    ).resolves.toEqual({
      createdAt: '2026-02-17T00:00:00.000Z',
      expiryMonth: null,
      expiryYear: null,
      gateway: 'GOOGLE_PAY',
      id: 'payment-method-1',
      isDefault: true,
      last4: '4242',
      updatedAt: '2026-02-17T00:00:00.000Z',
      userId: USER_ID,
    });

    expect(googlePayClientMock.exchangeToken).toHaveBeenCalledWith({
      paymentToken: 'google-pay-payment-token',
      transactionIdentifier: 'google-pay-transaction-1',
    });
    expect(prismaMock.paymentMethod.updateMany).toHaveBeenCalledWith({
      data: {
        isDefault: false,
      },
      where: {
        isDefault: true,
        userId: USER_ID,
      },
    });
    expect(prismaMock.paymentMethod.create).toHaveBeenCalled();
    expect(applePayClientMock.exchangeToken).not.toHaveBeenCalled();
  });

  it('uses ArCa pre-authorization flow for one Google Pay session payment', async () => {
    prismaMock.payment.findUnique.mockResolvedValue(null);
    prismaMock.paymentMethod.findFirst.mockResolvedValue(
      buildPaymentMethodRecord({
        gateway: PaymentGateway.GOOGLE_PAY,
        isDefault: true,
        token: 'google-tokenized-card-1',
      }),
    );
    arcaClientMock.preAuthorize.mockResolvedValue({
      gatewayTransactionId: 'arca-tx-1',
    });
    prismaMock.payment.create.mockResolvedValue(
      buildPaymentRecord({
        authorizedAmount: 0,
        gatewayTransactionId: null,
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

    expect(arcaClientMock.preAuthorize).toHaveBeenCalledWith({
      amount: 6200,
      cardToken: 'google-tokenized-card-1',
      currency: 'AMD',
      description: 'LiloCharge session pre-authorization',
      idempotencyKey: 'preauth-key-1',
      orderId: SESSION_ID,
    });
    // The PENDING row persists the pre-auth key before the gateway call.
    expect(prismaMock.payment.create).toHaveBeenCalledWith({
      data: {
        amount: 6200,
        authorizedAmount: 0,
        capturedAmount: 0,
        gateway: PaymentGateway.GOOGLE_PAY,
        gatewayTransactionId: null,
        paymentMethodId: 'payment-method-1',
        preauthIdempotencyKey: expect.stringMatching(UUID_PATTERN) as unknown as string,
        sessionId: SESSION_ID,
        status: PaymentStatus.PENDING,
        userId: USER_ID,
      },
      select: expect.any(Object) as never,
    });
    // Success transitions the PENDING row to AUTHORIZED conditionally.
    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
        status: { in: [PaymentStatus.PENDING, PaymentStatus.FAILED] },
      },
      data: {
        amount: 6200,
        authorizedAmount: 6200,
        gateway: PaymentGateway.GOOGLE_PAY,
        gatewayTransactionId: 'arca-tx-1',
        paymentMethodId: 'payment-method-1',
        status: PaymentStatus.AUTHORIZED,
      },
    });
    expect(idramClientMock.getBalance).not.toHaveBeenCalled();
  });

  it('uses ArCa capture flow for one authorized Google Pay payment', async () => {
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
    expect(idramClientMock.debitWallet).not.toHaveBeenCalled();
  });

  it('uses ArCa refund flow for one failed Google Pay session payment', async () => {
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
    expect(idramClientMock.refund).not.toHaveBeenCalled();
  });
});
