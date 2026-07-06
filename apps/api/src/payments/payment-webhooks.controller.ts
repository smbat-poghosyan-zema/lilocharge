import type { PaymentWebhookAckResponse } from '@lilocharge/shared-types';
import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/decorators/public.decorator';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { PaymentWebhooksService } from './payment-webhooks.service';

/**
 * Public (unauthenticated) endpoints receiving asynchronous ArCa/Idram payment callbacks.
 *
 * Authenticity is enforced by HMAC-SHA256 signature verification instead of JWT auth:
 * callers must send the payload signature in the `x-signature` header (see
 * {@link WebhookSignatureVerifier} for the exact signing convention). Requests with a
 * missing/invalid signature are rejected with 401 and requests arriving while the
 * gateway secret is unconfigured are rejected with 503.
 */
@ApiTags('payments')
@Controller('payments/webhooks')
export class PaymentWebhooksController {
  constructor(private readonly paymentWebhooksService: PaymentWebhooksService) {}

  /** Handles one ArCa payment status callback signed with ARCA_WEBHOOK_SECRET. */
  @Public()
  @Post('arca')
  @HttpCode(HttpStatus.OK)
  public async handleArcaWebhook(
    @Headers('x-signature') signature: string | undefined,
    @Body() dto: PaymentWebhookDto,
  ): Promise<PaymentWebhookAckResponse> {
    return this.paymentWebhooksService.processGatewayCallback({
      gateway: 'ARCA',
      payload: dto,
      signature,
    });
  }

  /** Handles one Idram payment status callback signed with IDRAM_WEBHOOK_SECRET. */
  @Public()
  @Post('idram')
  @HttpCode(HttpStatus.OK)
  public async handleIdramWebhook(
    @Headers('x-signature') signature: string | undefined,
    @Body() dto: PaymentWebhookDto,
  ): Promise<PaymentWebhookAckResponse> {
    return this.paymentWebhooksService.processGatewayCallback({
      gateway: 'IDRAM',
      payload: dto,
      signature,
    });
  }
}
