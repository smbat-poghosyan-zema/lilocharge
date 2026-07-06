import { randomUUID } from 'node:crypto';

import type {
  ExchangeApplePayTokenRequest,
  ExchangeGooglePayTokenRequest,
  PaymentGatewayCode,
  PaymentMethodResponse,
} from '@lilocharge/shared-types';
import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PaymentGateway, PaymentStatus } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApplePayClient } from './apple-pay.client';
import { ArcaClient } from './arca.client';
import { GooglePayClient } from './google-pay.client';
import { IdramClient } from './idram.client';

const DEFAULT_ARCA_PREAUTH_AMOUNT_AMD = 5000;
const DEFAULT_IDRAM_PREAUTH_AMOUNT_AMD = 5000;
const SUPPORTED_PAYMENT_GATEWAYS: PaymentGateway[] = [
  PaymentGateway.ARCA,
  PaymentGateway.IDRAM,
  PaymentGateway.APPLE_PAY,
  PaymentGateway.GOOGLE_PAY,
];

const PAYMENT_LOOKUP_SELECT = {
  amount: true,
  authorizedAmount: true,
  capturedAmount: true,
  captureIdempotencyKey: true,
  gateway: true,
  gatewayTransactionId: true,
  id: true,
  paymentMethodId: true,
  preauthIdempotencyKey: true,
  refundIdempotencyKey: true,
  sessionId: true,
  status: true,
  userId: true,
} satisfies Prisma.PaymentSelect;

const PAYMENT_METHOD_LOOKUP_SELECT = {
  gateway: true,
  id: true,
  token: true,
} satisfies Prisma.PaymentMethodSelect;

const PAYMENT_METHOD_RESPONSE_SELECT = {
  createdAt: true,
  expiryMonth: true,
  expiryYear: true,
  gateway: true,
  id: true,
  isDefault: true,
  last4: true,
  updatedAt: true,
  userId: true,
} satisfies Prisma.PaymentMethodSelect;

type PaymentLookupRecord = Prisma.PaymentGetPayload<{
  select: typeof PAYMENT_LOOKUP_SELECT;
}>;

type PaymentMethodLookupRecord = Prisma.PaymentMethodGetPayload<{
  select: typeof PAYMENT_METHOD_LOOKUP_SELECT;
}>;

type PaymentMethodResponseRecord = Prisma.PaymentMethodGetPayload<{
  select: typeof PAYMENT_METHOD_RESPONSE_SELECT;
}>;

/** Input used to pre-authorize one user session against one supported payment gateway. */
export interface PreAuthorizeArcaForSessionInput {
  readonly amount?: number;
  readonly sessionId: string;
  readonly userId: string;
}

/** Input used to capture one previously authorized session payment. */
export interface CaptureAuthorizedPaymentInput {
  readonly amount: number;
  readonly sessionId: string;
}

/** Service orchestrating ArCa/Idram payment pre-auth, capture, refund, and balance-check flows. */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly arcaClient: ArcaClient,
    private readonly idramClient: IdramClient,
    private readonly applePayClient: ApplePayClient,
    private readonly googlePayClient: GooglePayClient,
  ) {}

  /** Exchanges one Apple Pay payment token and persists an Apple Pay payment method for the user. */
  public async exchangeApplePayToken(
    userId: string,
    request: ExchangeApplePayTokenRequest,
  ): Promise<PaymentMethodResponse> {
    const exchangeResult = await this.applePayClient.exchangeToken({
      paymentToken: request.paymentToken,
      transactionIdentifier: request.transactionIdentifier,
    });
    const existingMethod = await this.findApplePayMethodByToken(
      userId,
      exchangeResult.paymentMethodToken,
    );
    const normalizedLast4 = normalizeCardLast4(request.cardLast4);
    const isDefault = request.isDefault ?? false;

    if (isDefault) {
      await this.prismaService.paymentMethod.updateMany({
        where: {
          isDefault: true,
          userId,
        },
        data: {
          isDefault: false,
        },
      });
    }

    if (existingMethod === null) {
      const createdMethod = await this.prismaService.paymentMethod.create({
        data: {
          gateway: PaymentGateway.APPLE_PAY,
          isDefault,
          last4: normalizedLast4,
          token: exchangeResult.paymentMethodToken,
          userId,
        },
        select: PAYMENT_METHOD_RESPONSE_SELECT,
      });

      return mapPaymentMethodRecordToResponse(createdMethod);
    }

    const updatedMethod = await this.prismaService.paymentMethod.update({
      where: {
        id: existingMethod.id,
      },
      data: {
        isDefault: request.isDefault ?? existingMethod.isDefault,
        last4: normalizedLast4 ?? existingMethod.last4,
        token: exchangeResult.paymentMethodToken,
      },
      select: PAYMENT_METHOD_RESPONSE_SELECT,
    });

    return mapPaymentMethodRecordToResponse(updatedMethod);
  }

  /** Exchanges one Google Pay payment token and persists a Google Pay payment method for the user. */
  public async exchangeGooglePayToken(
    userId: string,
    request: ExchangeGooglePayTokenRequest,
  ): Promise<PaymentMethodResponse> {
    const exchangeResult = await this.googlePayClient.exchangeToken({
      paymentToken: request.paymentToken,
      transactionIdentifier: request.transactionIdentifier,
    });
    const existingMethod = await this.findGooglePayMethodByToken(
      userId,
      exchangeResult.paymentMethodToken,
    );
    const normalizedLast4 = normalizeCardLast4(request.cardLast4);
    const isDefault = request.isDefault ?? false;

    if (isDefault) {
      await this.prismaService.paymentMethod.updateMany({
        where: {
          isDefault: true,
          userId,
        },
        data: {
          isDefault: false,
        },
      });
    }

    if (existingMethod === null) {
      const createdMethod = await this.prismaService.paymentMethod.create({
        data: {
          gateway: PaymentGateway.GOOGLE_PAY,
          isDefault,
          last4: normalizedLast4,
          token: exchangeResult.paymentMethodToken,
          userId,
        },
        select: PAYMENT_METHOD_RESPONSE_SELECT,
      });

      return mapPaymentMethodRecordToResponse(createdMethod);
    }

    const updatedMethod = await this.prismaService.paymentMethod.update({
      where: {
        id: existingMethod.id,
      },
      data: {
        isDefault: request.isDefault ?? existingMethod.isDefault,
        last4: normalizedLast4 ?? existingMethod.last4,
        token: exchangeResult.paymentMethodToken,
      },
      select: PAYMENT_METHOD_RESPONSE_SELECT,
    });

    return mapPaymentMethodRecordToResponse(updatedMethod);
  }

  /** Pre-authorizes one session payment and stores one authorized payment record in Prisma. */
  public async preAuthorizeArcaForSession(input: PreAuthorizeArcaForSessionInput): Promise<void> {
    const existingPayment = await this.findPaymentBySessionId(input.sessionId);

    if (
      existingPayment !== null &&
      (existingPayment.status === PaymentStatus.AUTHORIZED ||
        existingPayment.status === PaymentStatus.CAPTURED)
    ) {
      return;
    }

    const paymentMethod = await this.findSupportedPaymentMethod(input.userId);

    if (paymentMethod === null) {
      throw new BadRequestException('Supported payment method is not configured for this user');
    }

    const amount = input.amount ?? resolvePreAuthorizationAmountAmd(paymentMethod.gateway);
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException(
        `${resolveGatewayLabel(paymentMethod.gateway)} pre-authorization amount must be a positive integer`,
      );
    }

    const preauthIdempotencyKey = existingPayment?.preauthIdempotencyKey ?? randomUUID();
    const gatewayTransactionId = await this.preAuthorizeForGateway({
      amount,
      idempotencyKey: preauthIdempotencyKey,
      paymentMethod,
      sessionId: input.sessionId,
    });

    if (existingPayment === null) {
      await this.prismaService.payment.create({
        data: {
          amount,
          authorizedAmount: amount,
          capturedAmount: 0,
          gateway: paymentMethod.gateway,
          gatewayTransactionId,
          paymentMethodId: paymentMethod.id,
          preauthIdempotencyKey,
          sessionId: input.sessionId,
          status: PaymentStatus.AUTHORIZED,
          userId: input.userId,
        },
        select: {
          id: true,
        },
      });

      return;
    }

    await this.prismaService.payment.update({
      where: {
        id: existingPayment.id,
      },
      data: {
        amount,
        authorizedAmount: amount,
        gateway: paymentMethod.gateway,
        gatewayTransactionId,
        paymentMethodId: paymentMethod.id,
        preauthIdempotencyKey,
        status: PaymentStatus.AUTHORIZED,
      },
      select: {
        id: true,
      },
    });
  }

  /** Captures one authorized session payment amount via the recorded gateway after session completion. */
  public async captureAuthorizedPaymentForSession(
    input: CaptureAuthorizedPaymentInput,
  ): Promise<void> {
    if (input.amount <= 0) {
      return;
    }

    const payment = await this.findPaymentBySessionId(input.sessionId);

    if (payment === null || payment.status === PaymentStatus.REFUNDED) {
      return;
    }

    if (payment.status === PaymentStatus.CAPTURED && payment.capturedAmount === input.amount) {
      return;
    }

    const captureIdempotencyKey = await this.resolveCaptureIdempotencyKey(payment);

    let gatewayTransactionId: string | undefined;
    try {
      gatewayTransactionId = await this.captureForGateway({
        amount: input.amount,
        idempotencyKey: captureIdempotencyKey,
        payment,
      });
    } catch (error: unknown) {
      await this.notificationsService.sendPaymentFailedNotification({
        failureReason: resolveErrorMessage(error),
        sessionId: input.sessionId,
        userId: payment.userId,
      });
      throw error;
    }

    const updateData: Prisma.PaymentUpdateInput = {
      amount: input.amount,
      capturedAmount: input.amount,
      status: PaymentStatus.CAPTURED,
    };

    if (gatewayTransactionId !== undefined) {
      updateData.gatewayTransactionId = gatewayTransactionId;
    }

    await this.prismaService.payment.update({
      where: {
        id: payment.id,
      },
      data: updateData,
      select: {
        id: true,
      },
    });
    await this.notificationsService.sendPaymentSucceededNotification({
      paymentAmountAmd: input.amount,
      sessionId: input.sessionId,
      userId: payment.userId,
    });
  }

  /** Refunds one captured/authorized payment when the linked session fails. */
  public async refundPaymentForSessionFailure(sessionId: string): Promise<void> {
    const payment = await this.findPaymentBySessionId(sessionId);

    if (payment === null || payment.status === PaymentStatus.REFUNDED) {
      return;
    }

    const refundAmount = resolveRefundAmount(payment);
    const refundIdempotencyKey = await this.resolveRefundIdempotencyKey(payment);
    await this.refundForGateway(payment, refundAmount, refundIdempotencyKey);

    await this.prismaService.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        status: PaymentStatus.REFUNDED,
      },
      select: {
        id: true,
      },
    });
  }

  /** Checks one Idram wallet balance for a user with configured Idram payment method. */
  public async getIdramWalletBalance(userId: string): Promise<number> {
    const idramMethod = await this.findIdramPaymentMethod(userId);

    if (idramMethod === null) {
      throw new BadRequestException('Idram payment method is not configured for this user');
    }

    const balance = await this.idramClient.getBalance({
      currency: 'AMD',
      walletToken: idramMethod.token,
    });

    return balance.balance;
  }

  /**
   * Sets LiloCharge wallet as the user's default payment method.
   * Creates a WALLET payment method record if it doesn't exist.
   */
  public async setWalletAsPaymentMethod(userId: string): Promise<PaymentMethodResponse> {
    // Check if wallet payment method already exists
    const existingWalletMethod = await this.prismaService.paymentMethod.findFirst({
      where: {
        userId,
        gateway: PaymentGateway.WALLET,
      },
      select: PAYMENT_METHOD_RESPONSE_SELECT,
    });

    // Clear existing default payment methods
    await this.prismaService.paymentMethod.updateMany({
      where: {
        userId,
        isDefault: true,
      },
      data: {
        isDefault: false,
      },
    });

    if (existingWalletMethod !== null) {
      // Update existing wallet method to be default
      const updatedMethod = await this.prismaService.paymentMethod.update({
        where: {
          id: existingWalletMethod.id,
        },
        data: {
          isDefault: true,
        },
        select: PAYMENT_METHOD_RESPONSE_SELECT,
      });

      return mapPaymentMethodRecordToResponse(updatedMethod);
    }

    // Create new wallet payment method
    const createdMethod = await this.prismaService.paymentMethod.create({
      data: {
        userId,
        gateway: PaymentGateway.WALLET,
        token: `wallet-${userId}`,
        isDefault: true,
      },
      select: PAYMENT_METHOD_RESPONSE_SELECT,
    });

    return mapPaymentMethodRecordToResponse(createdMethod);
  }

  /** Dispatches one pre-authorization flow to ArCa or Idram and returns optional transaction metadata. */
  private async preAuthorizeForGateway(input: {
    readonly amount: number;
    readonly idempotencyKey: string;
    readonly paymentMethod: PaymentMethodLookupRecord;
    readonly sessionId: string;
  }): Promise<string | null> {
    if (isArcaRoutedGateway(input.paymentMethod.gateway)) {
      const result = await this.arcaClient.preAuthorize({
        amount: input.amount,
        cardToken: input.paymentMethod.token,
        currency: 'AMD',
        description: 'LiloCharge session pre-authorization',
        idempotencyKey: input.idempotencyKey,
        orderId: input.sessionId,
      });

      return result.gatewayTransactionId;
    }

    if (input.paymentMethod.gateway === PaymentGateway.IDRAM) {
      const balance = await this.idramClient.getBalance({
        currency: 'AMD',
        walletToken: input.paymentMethod.token,
      });

      if (balance.balance < input.amount) {
        throw new BadRequestException('Idram wallet balance is insufficient for pre-authorization');
      }

      return null;
    }

    throw new BadRequestException(
      `${resolveGatewayLabel(input.paymentMethod.gateway)} payment method is not supported`,
    );
  }

  /** Dispatches one capture flow to ArCa or Idram and returns updated gateway transaction metadata. */
  private async captureForGateway(input: {
    readonly amount: number;
    readonly idempotencyKey: string;
    readonly payment: PaymentLookupRecord;
  }): Promise<string | undefined> {
    if (input.payment.gateway === PaymentGateway.WALLET) {
      throw new InternalServerErrorException(
        'WALLET payments are settled by WalletService balance deduction; gateway capture must never be invoked for wallet-funded sessions',
      );
    }

    if (isArcaRoutedGateway(input.payment.gateway)) {
      if (input.payment.gatewayTransactionId === null) {
        throw new BadRequestException('ArCa gateway transaction id is missing for capture');
      }

      await this.arcaClient.capture({
        amount: input.amount,
        gatewayTransactionId: input.payment.gatewayTransactionId,
        idempotencyKey: input.idempotencyKey,
      });

      return undefined;
    }

    if (input.payment.gateway === PaymentGateway.IDRAM) {
      const paymentMethod = await this.findPaymentMethodById(input.payment.paymentMethodId);

      if (paymentMethod === null || paymentMethod.gateway !== PaymentGateway.IDRAM) {
        throw new BadRequestException('Idram payment method is missing for capture');
      }

      const debitResult = await this.idramClient.debitWallet({
        amount: input.amount,
        currency: 'AMD',
        description: 'LiloCharge session capture',
        idempotencyKey: input.idempotencyKey,
        orderId: input.payment.sessionId,
        walletToken: paymentMethod.token,
      });

      return debitResult.gatewayTransactionId;
    }

    throw new BadRequestException(
      `${resolveGatewayLabel(input.payment.gateway)} payment capture is not supported`,
    );
  }

  /** Dispatches one refund flow to ArCa or Idram for failed-session payment rollback. */
  private async refundForGateway(
    payment: PaymentLookupRecord,
    refundAmount: number,
    idempotencyKey: string,
  ): Promise<void> {
    if (payment.gateway === PaymentGateway.WALLET) {
      throw new InternalServerErrorException(
        'WALLET payments are refunded by WalletService balance credit; gateway refund must never be invoked for wallet-funded sessions',
      );
    }

    if (isArcaRoutedGateway(payment.gateway)) {
      if (payment.gatewayTransactionId === null) {
        throw new BadRequestException('ArCa gateway transaction id is missing for refund');
      }

      if (refundAmount > 0) {
        await this.arcaClient.refund({
          amount: refundAmount,
          gatewayTransactionId: payment.gatewayTransactionId,
          idempotencyKey,
        });
      }

      return;
    }

    if (payment.gateway === PaymentGateway.IDRAM) {
      if (refundAmount > 0) {
        if (payment.gatewayTransactionId === null) {
          if (payment.status === PaymentStatus.AUTHORIZED) {
            return;
          }

          throw new BadRequestException('Idram gateway transaction id is missing for refund');
        }

        await this.idramClient.refund({
          amount: refundAmount,
          gatewayTransactionId: payment.gatewayTransactionId,
          idempotencyKey,
        });
      }

      return;
    }

    throw new BadRequestException(
      `${resolveGatewayLabel(payment.gateway)} payment refund is not supported`,
    );
  }

  /**
   * Resolves the capture idempotency key for one payment, generating and persisting a fresh
   * UUID before the first gateway attempt so any retry after a failure reuses the same key.
   */
  private async resolveCaptureIdempotencyKey(payment: PaymentLookupRecord): Promise<string> {
    if (payment.captureIdempotencyKey !== null) {
      return payment.captureIdempotencyKey;
    }

    const captureIdempotencyKey = randomUUID();
    await this.prismaService.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        captureIdempotencyKey,
      },
      select: {
        id: true,
      },
    });

    return captureIdempotencyKey;
  }

  /**
   * Resolves the refund idempotency key for one payment, generating and persisting a fresh
   * UUID before the first gateway attempt so any retry after a failure reuses the same key.
   */
  private async resolveRefundIdempotencyKey(payment: PaymentLookupRecord): Promise<string> {
    if (payment.refundIdempotencyKey !== null) {
      return payment.refundIdempotencyKey;
    }

    const refundIdempotencyKey = randomUUID();
    await this.prismaService.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        refundIdempotencyKey,
      },
      select: {
        id: true,
      },
    });

    return refundIdempotencyKey;
  }

  /** Finds one session-scoped payment record by unique session id. */
  private async findPaymentBySessionId(sessionId: string): Promise<PaymentLookupRecord | null> {
    return this.prismaService.payment.findUnique({
      where: {
        sessionId,
      },
      select: PAYMENT_LOOKUP_SELECT,
    });
  }

  /** Finds one supported payment method for a user, preferring a default method when configured. */
  private async findSupportedPaymentMethod(
    userId: string,
  ): Promise<PaymentMethodLookupRecord | null> {
    const defaultMethod = await this.prismaService.paymentMethod.findFirst({
      where: {
        gateway: {
          in: SUPPORTED_PAYMENT_GATEWAYS,
        },
        isDefault: true,
        userId,
      },
      select: PAYMENT_METHOD_LOOKUP_SELECT,
    });

    if (defaultMethod !== null) {
      return defaultMethod;
    }

    return this.prismaService.paymentMethod.findFirst({
      where: {
        gateway: {
          in: SUPPORTED_PAYMENT_GATEWAYS,
        },
        userId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: PAYMENT_METHOD_LOOKUP_SELECT,
    });
  }

  /** Finds one Idram payment method for balance checks, preferring user default configuration. */
  private async findIdramPaymentMethod(userId: string): Promise<PaymentMethodLookupRecord | null> {
    const defaultMethod = await this.prismaService.paymentMethod.findFirst({
      where: {
        gateway: PaymentGateway.IDRAM,
        isDefault: true,
        userId,
      },
      select: PAYMENT_METHOD_LOOKUP_SELECT,
    });

    if (defaultMethod !== null) {
      return defaultMethod;
    }

    return this.prismaService.paymentMethod.findFirst({
      where: {
        gateway: PaymentGateway.IDRAM,
        userId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: PAYMENT_METHOD_LOOKUP_SELECT,
    });
  }

  /** Finds one payment method by id with gateway/token fields required for capture dispatch. */
  private async findPaymentMethodById(
    paymentMethodId: string,
  ): Promise<PaymentMethodLookupRecord | null> {
    return this.prismaService.paymentMethod.findUnique({
      where: {
        id: paymentMethodId,
      },
      select: PAYMENT_METHOD_LOOKUP_SELECT,
    });
  }

  /** Finds one Apple Pay payment method by token for idempotent token-exchange updates. */
  private async findApplePayMethodByToken(
    userId: string,
    token: string,
  ): Promise<PaymentMethodResponseRecord | null> {
    return this.prismaService.paymentMethod.findFirst({
      where: {
        gateway: PaymentGateway.APPLE_PAY,
        token,
        userId,
      },
      select: PAYMENT_METHOD_RESPONSE_SELECT,
    });
  }

  /** Finds one Google Pay payment method by token for idempotent token-exchange updates. */
  private async findGooglePayMethodByToken(
    userId: string,
    token: string,
  ): Promise<PaymentMethodResponseRecord | null> {
    return this.prismaService.paymentMethod.findFirst({
      where: {
        gateway: PaymentGateway.GOOGLE_PAY,
        token,
        userId,
      },
      select: PAYMENT_METHOD_RESPONSE_SELECT,
    });
  }
}

/** Maps a payment-method database record into API response shape. */
function mapPaymentMethodRecordToResponse(
  record: PaymentMethodResponseRecord,
): PaymentMethodResponse {
  return {
    createdAt: record.createdAt.toISOString(),
    expiryMonth: record.expiryMonth,
    expiryYear: record.expiryYear,
    gateway: mapPaymentGatewayToCode(record.gateway),
    id: record.id,
    isDefault: record.isDefault,
    last4: record.last4,
    updatedAt: record.updatedAt.toISOString(),
    userId: record.userId,
  };
}

/** Resolves session-failure refund amount, preferring captured totals over authorized totals. */
function resolveRefundAmount(payment: PaymentLookupRecord): number {
  if (payment.capturedAmount > 0) {
    return payment.capturedAmount;
  }

  if (payment.authorizedAmount > 0) {
    return payment.authorizedAmount;
  }

  return 0;
}

/** Resolves gateway-specific pre-auth amount from environment with safe integer fallback. */
function resolvePreAuthorizationAmountAmd(gateway: PaymentGateway): number {
  if (gateway === PaymentGateway.IDRAM) {
    return parsePositiveIntegerOrDefault(
      process.env.IDRAM_PREAUTH_AMOUNT_AMD,
      DEFAULT_IDRAM_PREAUTH_AMOUNT_AMD,
    );
  }

  return parsePositiveIntegerOrDefault(
    process.env.ARCA_PREAUTH_AMOUNT_AMD,
    DEFAULT_ARCA_PREAUTH_AMOUNT_AMD,
  );
}

/** Converts one payment gateway enum into stable user-facing label text. */
function resolveGatewayLabel(gateway: PaymentGateway): string {
  if (gateway === PaymentGateway.ARCA) {
    return 'ArCa';
  }

  if (gateway === PaymentGateway.IDRAM) {
    return 'Idram';
  }

  if (gateway === PaymentGateway.APPLE_PAY) {
    return 'Apple Pay';
  }

  if (gateway === PaymentGateway.GOOGLE_PAY) {
    return 'Google Pay';
  }

  return gateway;
}

/** Returns whether a payment gateway should be routed through the ArCa card API client. */
function isArcaRoutedGateway(gateway: PaymentGateway): boolean {
  return (
    gateway === PaymentGateway.ARCA ||
    gateway === PaymentGateway.APPLE_PAY ||
    gateway === PaymentGateway.GOOGLE_PAY
  );
}

/** Maps Prisma payment-gateway enums into shared API payment-gateway codes. */
function mapPaymentGatewayToCode(gateway: PaymentGateway): PaymentGatewayCode {
  switch (gateway) {
    case PaymentGateway.APPLE_PAY:
      return 'APPLE_PAY';
    case PaymentGateway.ARCA:
      return 'ARCA';
    case PaymentGateway.GOOGLE_PAY:
      return 'GOOGLE_PAY';
    case PaymentGateway.IDRAM:
      return 'IDRAM';
    case PaymentGateway.WALLET:
    default:
      return 'WALLET';
  }
}

/** Parses positive integer values and falls back when missing or invalid. */
function parsePositiveIntegerOrDefault(rawValue: string | undefined, fallback: number): number {
  if (rawValue === undefined) {
    return fallback;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
}

/** Normalizes optional card-last4 values and returns null for blank input. */
function normalizeCardLast4(cardLast4: string | undefined): string | null {
  const normalizedValue = cardLast4?.trim();

  if (normalizedValue === undefined || normalizedValue.length === 0) {
    return null;
  }

  return normalizedValue;
}

/** Resolves log-friendly error text for unknown thrown payment-capture failures. */
function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown payment error';
}
