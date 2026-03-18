import type { StationDetailQueryRequest } from '@lilocharge/shared-types';
import { ConnectorType } from '@lilocharge/shared-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;
const MAX_MINIMUM_POWER_KW = 500;
const MAX_STATION_FILTER_ITEM_COUNT = 12;
const MIN_LATITUDE = -90;
const MIN_LONGITUDE = -180;
const MIN_MINIMUM_POWER_KW = 1;

/** DTO validating optional coordinate and filter context for station detail views. */
export class StationDetailQueryDto implements StationDetailQueryRequest {
  @ValidateIf(
    (dto: StationDetailQueryDto) => dto.latitude !== undefined || dto.longitude !== undefined,
  )
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(MIN_LATITUDE)
  @Max(MAX_LATITUDE)
  public latitude?: number;

  @ValidateIf(
    (dto: StationDetailQueryDto) => dto.latitude !== undefined || dto.longitude !== undefined,
  )
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(MIN_LONGITUDE)
  @Max(MAX_LONGITUDE)
  public longitude?: number;

  @IsOptional()
  @Transform(({ value }) => parseStringArrayFilter(value))
  @IsArray()
  @ArrayMaxSize(MAX_STATION_FILTER_ITEM_COUNT)
  @IsEnum(ConnectorType, { each: true })
  public connectorTypes?: ConnectorType[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(MIN_MINIMUM_POWER_KW)
  @Max(MAX_MINIMUM_POWER_KW)
  public minimumPowerKw?: number;
}

/**
 * Converts repeated and comma-separated query parameter values into an optional string array.
 */
function parseStringArrayFilter(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const normalized = value
      .flatMap((entry) => parseStringArrayFilter(entry) ?? [])
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    return normalized.length > 0 ? normalized : undefined;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return normalized.length > 0 ? normalized : undefined;
}
