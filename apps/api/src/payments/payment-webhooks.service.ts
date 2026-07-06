import type {
  PaymentGatewayWebhookPayload,
  PaymentWebhookAckResponse,
  PaymentWebhookStatus,
} from '@lilocharge/shared-types';
import {
  Injectable,
  NotFoundException,
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
 * Service processing signed ArCa/Idram webhook callbacks into payment status updates.
 *
 * Callbacks are only processed after HMAC verification against the per-gateway secret
 * (ARCA_WEBHOOK_SECRET / IDRAM_WEBHOOK_SECRET); an unconfigured secret rejects the
 * request with 503 so unverified callbacks are never applied. Processing is idempotent:
 * replaying the same callback acknowledges with 200 without a second transition.
 */
@Injectable()
export class PaymentWebhooksService {
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
      throw new NotFoundException(
        `Payment not found for ${gatewayConfig.label} webhook order ${input.payload.orderId}`,
      );
    }

    const targetStatus = mapWebhookStatusToPaymentStatus(input.payload.status);

    if (!ALLOWED_STATUS_TRANSITIONS[payment.status].includes(targetStatus)) {
      // Duplicate or out-of-order delivery: acknowledge so the gateway stops retrying.
      return { received: true };
    }

    await this.prismaService.payment.update({
      where: {
        id: payment.id,
      },
      data: buildPaymentUpdateData(input.payload, targetStatus),
      select: {
        id: true,
      },
    });

    return { received: true };
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
): Prisma.PaymentUpdateInput {
  const updateData: Prisma.PaymentUpdateInput = {
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
