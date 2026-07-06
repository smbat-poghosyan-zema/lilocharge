import type { PaymentGatewayWebhookPayload } from '@lilocharge/shared-types';
import {
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';

import type { PrismaService } from '../prisma/prisma.service';
import { PaymentWebhooksService } from './payment-webhooks.service';
import { WebhookSignatureVerifier } from './webhook-signature.verifier';

const SESSION_ID = '22222222-2222-2222-2222-222222222222';
const ARCA_SECRET = 'arca-webhook-secret-1';
const IDRAM_SECRET = 'idram-webhook-secret-1';

interface WebhookPaymentRecord {
  readonly gatewayTransactionId: string | null;
  readonly id: string;
  readonly status: PaymentStatus;
}

interface PrismaPaymentDelegateMock {
  readonly findFirst: jest.Mock<Promise<WebhookPaymentRecord | null>, [unknown]>;
  readonly findUnique: jest.Mock<Promise<WebhookPaymentRecord | null>, [unknown]>;
  readonly update: jest.Mock<Promise<{ readonly id: string }>, [unknown]>;
}

interface PrismaServiceMock {
  readonly payment: PrismaPaymentDelegateMock;
}

/** Builds one webhook callback payload fixture for deterministic webhook-service tests. */
function buildWebhookPayload(
  overrides?: Partial<PaymentGatewayWebhookPayload>,
): PaymentGatewayWebhookPayload {
  return {
    amount: 4200,
    gatewayTransactionId: 'arca-tx-1',
    orderId: SESSION_ID,
    status: 'CAPTURED',
    ...overrides,
  };
}

describe('PaymentWebhooksService', () => {
  const signatureVerifier = new WebhookSignatureVerifier();
  let prismaMock: PrismaServiceMock;
  let service: PaymentWebhooksService;
  let previousArcaSecret: string | undefined;
  let previousIdramSecret: string | undefined;

  /** Computes one valid signature header for the given payload and secret. */
  function signPayload(payload: PaymentGatewayWebhookPayload, secret: string): string {
    return signatureVerifier.computeSignature(payload, secret);
  }

  beforeEach(() => {
    previousArcaSecret = process.env.ARCA_WEBHOOK_SECRET;
    previousIdramSecret = process.env.IDRAM_WEBHOOK_SECRET;
    process.env.ARCA_WEBHOOK_SECRET = ARCA_SECRET;
    process.env.IDRAM_WEBHOOK_SECRET = IDRAM_SECRET;

    prismaMock = {
      payment: {
        findFirst: jest.fn<Promise<WebhookPaymentRecord | null>, [unknown]>(),
        findUnique: jest.fn<Promise<WebhookPaymentRecord | null>, [unknown]>(),
        update: jest.fn<Promise<{ readonly id: string }>, [unknown]>(),
      },
    };
    service = new PaymentWebhooksService(
      prismaMock as unknown as PrismaService,
      signatureVerifier,
    );
  });

  afterEach(() => {
    if (previousArcaSecret === undefined) {
      delete process.env.ARCA_WEBHOOK_SECRET;
    } else {
      process.env.ARCA_WEBHOOK_SECRET = previousArcaSecret;
    }

    if (previousIdramSecret === undefined) {
      delete process.env.IDRAM_WEBHOOK_SECRET;
    } else {
      process.env.IDRAM_WEBHOOK_SECRET = previousIdramSecret;
    }
  });

  it('applies one valid ArCa capture callback to the matching payment', async () => {
    const payload = buildWebhookPayload();
    prismaMock.payment.findFirst.mockResolvedValue({
      gatewayTransactionId: 'arca-tx-1',
      id: 'payment-1',
      status: PaymentStatus.AUTHORIZED,
    });
    prismaMock.payment.update.mockResolvedValue({ id: 'payment-1' });

    await expect(
      service.processGatewayCallback({
        gateway: 'ARCA',
        payload,
        signature: signPayload(payload, ARCA_SECRET),
      }),
    ).resolves.toEqual({ received: true });

    expect(prismaMock.payment.findFirst).toHaveBeenCalledWith({
      where: {
        gatewayTransactionId: 'arca-tx-1',
      },
      select: expect.any(Object) as unknown as object,
    });
    expect(prismaMock.payment.update).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
      },
      data: {
        amount: 4200,
        capturedAmount: 4200,
        gatewayTransactionId: 'arca-tx-1',
        status: PaymentStatus.CAPTURED,
      },
      select: {
        id: true,
      },
    });
  });

  it('falls back to the session order id when the gateway transaction id is unknown', async () => {
    const payload = buildWebhookPayload({ status: 'REFUNDED' });
    prismaMock.payment.findFirst.mockResolvedValue(null);
    prismaMock.payment.findUnique.mockResolvedValue({
      gatewayTransactionId: null,
      id: 'payment-1',
      status: PaymentStatus.CAPTURED,
    });
    prismaMock.payment.update.mockResolvedValue({ id: 'payment-1' });

    await expect(
      service.processGatewayCallback({
        gateway: 'IDRAM',
        payload,
        signature: signPayload(payload, IDRAM_SECRET),
      }),
    ).resolves.toEqual({ received: true });

    expect(prismaMock.payment.findUnique).toHaveBeenCalledWith({
      where: {
        sessionId: SESSION_ID,
      },
      select: expect.any(Object) as unknown as object,
    });
    expect(prismaMock.payment.update).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
      },
      data: {
        gatewayTransactionId: 'arca-tx-1',
        status: PaymentStatus.REFUNDED,
      },
      select: {
        id: true,
      },
    });
  });

  it('rejects callbacks with an invalid signature without touching payments', async () => {
    const payload = buildWebhookPayload();

    await expect(
      service.processGatewayCallback({
        gateway: 'ARCA',
        payload,
        signature: signPayload(payload, 'wrong-secret'),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prismaMock.payment.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });

  it('rejects callbacks with a missing signature header', async () => {
    await expect(
      service.processGatewayCallback({
        gateway: 'ARCA',
        payload: buildWebhookPayload(),
        signature: undefined,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prismaMock.payment.findFirst).not.toHaveBeenCalled();
  });

  it('rejects callbacks with 503 when the webhook secret is not configured', async () => {
    delete process.env.ARCA_WEBHOOK_SECRET;
    const payload = buildWebhookPayload();

    await expect(
      service.processGatewayCallback({
        gateway: 'ARCA',
        payload,
        signature: signPayload(payload, ARCA_SECRET),
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(prismaMock.payment.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });

  it('returns 404 when no payment matches the callback identifiers', async () => {
    const payload = buildWebhookPayload({ orderId: 'wallet-topup-not-a-session' });
    prismaMock.payment.findFirst.mockResolvedValue(null);

    await expect(
      service.processGatewayCallback({
        gateway: 'ARCA',
        payload,
        signature: signPayload(payload, ARCA_SECRET),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prismaMock.payment.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });

  it('acknowledges duplicate callbacks without a second status transition', async () => {
    const payload = buildWebhookPayload();
    prismaMock.payment.findFirst.mockResolvedValue({
      gatewayTransactionId: 'arca-tx-1',
      id: 'payment-1',
      status: PaymentStatus.CAPTURED,
    });

    await expect(
      service.processGatewayCallback({
        gateway: 'ARCA',
        payload,
        signature: signPayload(payload, ARCA_SECRET),
      }),
    ).resolves.toEqual({ received: true });

    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });

  it('acknowledges out-of-order authorization callbacks after capture without downgrading', async () => {
    const payload = buildWebhookPayload({ status: 'AUTHORIZED' });
    prismaMock.payment.findFirst.mockResolvedValue({
      gatewayTransactionId: 'arca-tx-1',
      id: 'payment-1',
      status: PaymentStatus.CAPTURED,
    });

    await expect(
      service.processGatewayCallback({
        gateway: 'ARCA',
        payload,
        signature: signPayload(payload, ARCA_SECRET),
      }),
    ).resolves.toEqual({ received: true });

    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });
});
