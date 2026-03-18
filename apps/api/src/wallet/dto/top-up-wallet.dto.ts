import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * DTO for topping up wallet balance via ArCa or Idram payment gateway.
 * Validates amount and gateway selection.
 */
export class TopUpWalletDto {
  @IsInt()
  @Min(100)
  @Max(1000000)
  readonly amount!: number;

  @IsEnum(['ARCA', 'IDRAM'])
  readonly gateway!: 'ARCA' | 'IDRAM';

  @IsOptional()
  @IsString()
  readonly paymentMethodId?: string;
}
