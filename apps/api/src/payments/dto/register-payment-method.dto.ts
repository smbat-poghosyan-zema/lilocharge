import type {
  RegisterPaymentMethodRequest,
  TokenizedPaymentGatewayCode,
} from '@lilocharge/shared-types';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Gateways whose client-side tokenization/binding flow produces a storable payment token. */
export const TOKENIZED_PAYMENT_GATEWAYS: readonly TokenizedPaymentGatewayCode[] = [
  'ARCA',
  'IDRAM',
];

/** DTO registering one tokenized ArCa/Idram payment method for a user. */
export class RegisterPaymentMethodDto implements RegisterPaymentMethodRequest {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  public displayLabel?: string;

  @IsIn(TOKENIZED_PAYMENT_GATEWAYS)
  public gateway!: TokenizedPaymentGatewayCode;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  public token!: string;
}
