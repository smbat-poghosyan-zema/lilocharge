import type { UpdateConnectorStatusRequest } from '@lilocharge/shared-types';
import { StationStatus } from '@lilocharge/shared-types';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

const STATION_STATUSES: readonly StationStatus[] = [
  StationStatus.AVAILABLE,
  StationStatus.OCCUPIED,
  StationStatus.OFFLINE,
  StationStatus.MAINTENANCE,
];

/** DTO used to update one connector's status payload. */
export class UpdateConnectorStatusDto implements UpdateConnectorStatusRequest {
  @IsIn(STATION_STATUSES)
  public status!: StationStatus;

  @IsOptional()
  @IsDateString()
  public lastStatusUpdate?: string;
}
