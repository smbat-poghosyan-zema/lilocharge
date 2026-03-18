import type { ExchangeGooglePayTokenRequest } from '@lilocharge/shared-types';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

/** DTO used to exchange one Google Pay payment token for a backend payment-method token. */
export class ExchangeGooglePayTokenDto implements ExchangeGooglePayTokenRequest {
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
