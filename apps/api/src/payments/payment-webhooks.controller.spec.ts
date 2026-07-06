import 'reflect-metadata';

import type { PaymentWebhookAckResponse } from '@lilocharge/shared-types';

import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import type { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { PaymentWebhooksController } from './payment-webhooks.controller';
import type { PaymentWebhooksService } from './payment-webhooks.service';

interface PaymentWebhooksServiceMock {
  readonly processGatewayCallback: jest.Mock<
    Promise<PaymentWebhookAckResponse>,
    Parameters<PaymentWebhooksService['processGatewayCallback']>
  >;
}

/** Builds one webhook DTO fixture for controller delegation assertions. */
function buildWebhookDto(): PaymentWebhookDto {
  return {
    amount: 4200,
    gatewayTransactionId: 'gw-tx-1',
    orderId: '22222222-2222-2222-2222-222222222222',
    status: 'CAPTURED',
  };
}

describe('PaymentWebhooksController', () => {
  let controller: PaymentWebhooksController;
  let serviceMock: PaymentWebhooksServiceMock;

  beforeEach(() => {
    serviceMock = {
      processGatewayCallback: jest
        .fn<
          Promise<PaymentWebhookAckResponse>,
          Parameters<PaymentWebhooksService['processGatewayCallback']>
        >()
        .mockResolvedValue({ received: true }),
    };
    controller = new PaymentWebhooksController(serviceMock as unknown as PaymentWebhooksService);
  });

  it('delegates ArCa callbacks with the supplied signature header', async () => {
    const dto = buildWebhookDto();

    await expect(controller.handleArcaWebhook('signature-1', dto)).resolves.toEqual({
      received: true,
    });

    expect(serviceMock.processGatewayCallback).toHaveBeenCalledWith({
      gateway: 'ARCA',
      payload: dto,
      signature: 'signature-1',
    });
  });

  it('delegates Idram callbacks with the supplied signature header', async () => {
    const dto = buildWebhookDto();

    await expect(controller.handleIdramWebhook('signature-2', dto)).resolves.toEqual({
      received: true,
    });

    expect(serviceMock.processGatewayCallback).toHaveBeenCalledWith({
      gateway: 'IDRAM',
      payload: dto,
      signature: 'signature-2',
    });
  });

  it('marks both webhook handlers as public so gateways can call without JWT auth', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const arcaHandler = PaymentWebhooksController.prototype.handleArcaWebhook;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const idramHandler = PaymentWebhooksController.prototype.handleIdramWebhook;

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, arcaHandler)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, idramHandler)).toBe(true);
  });
});
