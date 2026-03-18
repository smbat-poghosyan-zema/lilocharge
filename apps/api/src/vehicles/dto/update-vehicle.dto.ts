import type {
  ConnectorType as SharedConnectorType,
  UpdateVehicleRequest,
} from '@lilocharge/shared-types';
import { ConnectorType } from '@lilocharge/shared-types';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const CONNECTOR_TYPES: readonly SharedConnectorType[] = [
  ConnectorType.TYPE_1,
  ConnectorType.TYPE_2,
  ConnectorType.CCS,
  ConnectorType.CHADEMO,
  ConnectorType.TESLA,
  ConnectorType.GBT,
];
const MAX_VEHICLE_YEAR = 2050;
const MIN_VEHICLE_YEAR = 1990;
const VEHICLE_TEXT_MAX_LENGTH = 100;

/** DTO used to update editable vehicle profile fields. */
export class UpdateVehicleDto implements UpdateVehicleRequest {
  @IsOptional()
  @IsString()
  @MaxLength(VEHICLE_TEXT_MAX_LENGTH)
  public make?: string;

  @IsOptional()
  @IsString()
  @MaxLength(VEHICLE_TEXT_MAX_LENGTH)
  public model?: string;

  @IsOptional()
  @IsInt()
  @Min(MIN_VEHICLE_YEAR)
  @Max(MAX_VEHICLE_YEAR)
  public year?: number;

  @IsOptional()
  @IsIn(CONNECTOR_TYPES)
  public connectorType?: SharedConnectorType;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.1)
  public batteryCapacity?: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.1)
  public maxChargePower?: number;
}
