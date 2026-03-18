import type { ListConnectorStatusUpdatesQueryRequest } from '@lilocharge/shared-types';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/** DTO for querying connector status updates with pagination. */
export class ListConnectorStatusUpdatesQueryDto implements ListConnectorStatusUpdatesQueryRequest {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  readonly page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  readonly limit?: number;

  @IsUUID()
  @IsOptional()
  readonly connectorId?: string;

  @IsUUID()
  @IsOptional()
  readonly userId?: string;
}
