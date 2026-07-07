import type {
  PaymentGatewayWebhookPayload,
  PaymentWebhookAckResponse,
  PaymentWebhookStatus,
} from '@lilocharge/shared-types';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PaymentStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { WebhookSignatureVerifier } from './webhook-signature.verifier';

/** Gateways that deliver asynchronous payment status callbacks to the API. */
export type WebhookGateway = 'ARCA' | 'IDRAM';

interface WebhookGatewayConfig {
  readonly label: string;
  readonly secretEnvVar: string;
}

const WEBHOOK_GATEWAY_CONFIG: Record<WebhookGateway, WebhookGatewayConfig> = {
  ARCA: {
    label: 'ArCa',
    secretEnvVar: 'ARCA_WEBHOOK_SECRET',
  },
  IDRAM: {
    label: 'Idram',
    secretEnvVar: 'IDRAM_WEBHOOK_SECRET',
  },
};

const WEBHOOK_PAYMENT_SELECT = {
  gatewayTransactionId: true,
  id: true,
  status: true,
} satisfies Prisma.PaymentSelect;

type WebhookPaymentRecord = Prisma.PaymentGetPayload<{
  select: typeof WEBHOOK_PAYMENT_SELECT;
}>;

/**
 * Forward-only payment status transitions a webhook is allowed to apply.
 * Anything absent here (including exact repeats) is treated as a duplicate or
 * out-of-order delivery and acknowledged with 200 without touching the record.
 */
const ALLOWED_STATUS_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  [PaymentStatus.PENDING]: [
    PaymentStatus.AUTHORIZED,
    PaymentStatus.CAPTURED,
    PaymentStatus.FAILED,
    PaymentStatus.REFUNDED,
  ],
  [PaymentStatus.AUTHORIZED]: [
    PaymentStatus.CAPTURED,
    PaymentStatus.FAILED,
    PaymentStatus.REFUNDED,
  ],
  [PaymentStatus.CAPTURED]: [PaymentStatus.REFUNDED],
  [PaymentStatus.FAILED]: [PaymentStatus.AUTHORIZED, PaymentStatus.CAPTURED],
  [PaymentStatus.REFUNDED]: [],
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Maximum conditional-update attempts when concurrent writers (synchronous capture,
 * another webhook delivery) transition the payment between our read and write.
 */
const MAX_TRANSITION_ATTEMPTS = 3;

/**
 * Service processing signed ArCa/Idram webhook callbacks into payment status updates.
 *
 * Callbacks are only processed after HMAC verification against the per-gateway secret
 * (ARCA_WEBHOOK_SECRET / IDRAM_WEBHOOK_SECRET); an unconfigured secret rejects the
 * request with 503 so unverified callbacks are never applied. Processing is idempotent:
 * replaying the same callback acknowledges with 200 without a second transition.
 */
@Injectable()
export class PaymentWebhooksService {
  private readonly logger: Logger = new Logger(PaymentWebhooksService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly signatureVerifier: WebhookSignatureVerifier,
  ) {}

  /** Verifies and applies one gateway webhook callback, returning a stable acknowledgement. */
  public async processGatewayCallback(input: {
    readonly gateway: WebhookGateway;
    readonly payload: PaymentGatewayWebhookPayload;
    readonly signature: string | undefined;
  }): Promise<PaymentWebhookAckResponse> {
    const gatewayConfig = WEBHOOK_GATEWAY_CONFIG[input.gateway];
    const secret = normalizeOptionalString(process.env[gatewayConfig.secretEnvVar]);

    if (secret === undefined) {
      throw new ServiceUnavailableException(
        `${gatewayConfig.label} webhook secret is not configured (set ${gatewayConfig.secretEnvVar})`,
      );
    }

    if (
      input.signature === undefined ||
      input.signature.trim().length === 0 ||
      !this.signatureVerifier.verify({
        payload: input.payload,
        secret,
        signature: input.signature,
      })
    ) {
      throw new UnauthorizedException(`${gatewayConfig.label} webhook signature is invalid`);
    }

    const payment = await this.findPaymentForCallback(input.payload);

    if (payment === null) {
      // The signature already proved the callback comes from the gateway; a 4xx here would
      // only make the gateway retry an order we will never know (e.g. created against
      // another environment), so acknowledge and keep an operator-visible trace.
      this.logger.warn(
        `No payment matches ${gatewayConfig.label} webhook order ${input.payload.orderId} (transaction ${input.payload.gatewayTransactionId}); acknowledging without processing`,
      );

      return { received: true };
    }

    const targetStatus = mapWebhookStatusToPaymentStatus(input.payload.status);
    await this.applyStatusTransition(payment, input.payload, targetStatus);

    return { received: true };
  }

  /**
   * Applies one forward-only status transition with a conditional compare-and-swap write.
   *
   * The update only matches while the payment still has the status we validated against
   * the transition table, so a concurrent synchronous capture or another webhook delivery
   * can never be overwritten blindly. On a lost race (count === 0) the payment is re-read
   * and the transition re-evaluated; disallowed transitions are dropped (acknowledged
   * upstream) exactly like duplicate or out-of-order deliveries.
   */
  private async applyStatusTransition(
    payment: WebhookPaymentRecord,
    payload: PaymentGatewayWebhookPayload,
    targetStatus: PaymentStatus,
  ): Promise<void> {
    let currentPayment: WebhookPaymentRecord | null = payment;

    for (let attempt = 0; attempt < MAX_TRANSITION_ATTEMPTS; attempt += 1) {
      if (
        currentPayment === null ||
        !ALLOWED_STATUS_TRANSITIONS[currentPayment.status].includes(targetStatus)
      ) {
        // Duplicate or out-of-order delivery: acknowledge so the gateway stops retrying.
        return;
      }

      const updated = await this.prismaService.payment.updateMany({
        where: {
          id: currentPayment.id,
          status: currentPayment.status,
        },
        data: buildPaymentUpdateData(payload, targetStatus),
      });

      if (updated.count > 0) {
        return;
      }

      // Someone else transitioned the payment between our read and write; re-read and
      // reconcile against the forward-only transition table.
      currentPayment = await this.prismaService.payment.findUnique({
        where: { id: currentPayment.id },
        select: WEBHOOK_PAYMENT_SELECT,
      });
    }

    this.logger.warn(
      `Gave up applying webhook status ${targetStatus} to payment ${payment.id} after ${MAX_TRANSITION_ATTEMPTS} contended attempts`,
    );
  }

  /**
   * Finds the payment referenced by one callback, preferring the gateway transaction id
   * recorded at pre-auth/capture time and falling back to the merchant order id, which is
   * the charging session id for session payments.
   */
  private async findPaymentForCallback(
    payload: PaymentGatewayWebhookPayload,
  ): Promise<WebhookPaymentRecord | null> {
    const paymentByTransactionId = await this.prismaService.payment.findFirst({
      where: {
        gatewayTransactionId: payload.gatewayTransactionId,
      },
      select: WEBHOOK_PAYMENT_SELECT,
    });

    if (paymentByTransactionId !== null) {
      return paymentByTransactionId;
    }

    if (!UUID_PATTERN.test(payload.orderId)) {
      return null;
    }

    return this.prismaService.payment.findUnique({
      where: {
        sessionId: payload.orderId,
      },
      select: WEBHOOK_PAYMENT_SELECT,
    });
  }
}

/** Maps one webhook status literal onto the persisted Prisma payment status enum. */
function mapWebhookStatusToPaymentStatus(status: PaymentWebhookStatus): PaymentStatus {
  switch (status) {
    case 'AUTHORIZED':
      return PaymentStatus.AUTHORIZED;
    case 'CAPTURED':
      return PaymentStatus.CAPTURED;
    case 'FAILED':
      return PaymentStatus.FAILED;
    case 'REFUNDED':
      return PaymentStatus.REFUNDED;
  }
}

/** Builds the payment update payload for one accepted webhook transition. */
function buildPaymentUpdateData(
  payload: PaymentGatewayWebhookPayload,
  targetStatus: PaymentStatus,
): Prisma.PaymentUpdateManyMutationInput {
  const updateData: Prisma.PaymentUpdateManyMutationInput = {
    gatewayTransactionId: payload.gatewayTransactionId,
    status: targetStatus,
  };

  if (targetStatus === PaymentStatus.AUTHORIZED) {
    updateData.authorizedAmount = payload.amount;
  }

  if (targetStatus === PaymentStatus.CAPTURED) {
    updateData.amount = payload.amount;
    updateData.capturedAmount = payload.amount;
  }

  return updateData;
}

/** Normalizes optional string values by trimming and removing empty content. */
function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalizedValue = value?.trim();

  if (normalizedValue === undefined || normalizedValue.length === 0) {
    return undefined;
  }

  return normalizedValue;
}
