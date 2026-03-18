import type { ExchangeApplePayTokenRequest } from '@lilocharge/shared-types';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

/** DTO used to exchange one Apple Pay payment token for a backend payment-method token. */
export class ExchangeApplePayTokenDto implements ExchangeApplePayTokenRequest {
  @IsOptional()
  @IsString()
  @Length(4, 4)
  public cardLast4?: string;

  @IsOptional()
  @IsBoolean()
  public isDefault?: boolean;

  @IsString()
  public paymentToken!: string;

  @IsString()
  public transactionIdentifier!: string;
}
