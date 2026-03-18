import type { ConnectorPricingCalculationRequest } from '@lilocharge/shared-types';
import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';

/** DTO used to calculate connector pricing from usage and time values. */
export class CalculateConnectorPricingDto implements ConnectorPricingCalculationRequest {
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  public energyKwh!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  public chargingDurationMinutes!: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  public idleDurationMinutes?: number;

  @IsOptional()
  @IsDateString()
  public calculateAt?: string;
}
