import type { CreateConnectorStatusUpdateRequest } from '@lilocharge/shared-types';
import { StationStatus } from '@lilocharge/shared-types';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

/** DTO for creating a new connector status update. */
export class CreateConnectorStatusUpdateDto implements CreateConnectorStatusUpdateRequest {
  @IsUUID()
  @IsNotEmpty()
  readonly connectorId!: string;

  @IsEnum(StationStatus)
  @IsNotEmpty()
  readonly status!: StationStatus;

  @IsString()
  @IsOptional()
  readonly comment?: string;
}
