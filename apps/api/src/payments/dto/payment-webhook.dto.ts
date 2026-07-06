import type { PaymentGatewayWebhookPayload, PaymentWebhookStatus } from '@lilocharge/shared-types';
import { IsIn, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

/** Payment statuses accepted from gateway webhook notifications. */
export const PAYMENT_WEBHOOK_STATUSES: readonly PaymentWebhookStatus[] = [
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'REFUNDED',
];

/** DTO carrying one ArCa/Idram gateway webhook callback body. */
export class PaymentWebhookDto implements PaymentGatewayWebhookPayload {
  @IsInt()
  @Min(0)
  public amount!: number;

  @IsString()
  @IsNotEmpty()
  public gatewayTransactionId!: string;

  @IsString()
  @IsNotEmpty()
  public orderId!: string;

  @IsIn(PAYMENT_WEBHOOK_STATUSES)
  public status!: PaymentWebhookStatus;
}
