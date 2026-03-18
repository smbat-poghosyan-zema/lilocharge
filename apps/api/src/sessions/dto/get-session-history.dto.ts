import type { SessionHistoryQuery } from '@lilocharge/shared-types';
import { SessionStatus } from '@lilocharge/shared-types';
import { IsEnum, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** DTO for querying session history with pagination and optional filters. */
export class GetSessionHistoryDto implements SessionHistoryQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  public limit?: number;

  @IsOptional()
  @IsEnum(SessionStatus)
  public status?: SessionStatus;

  @IsOptional()
  @IsISO8601()
  public startDate?: string;

  @IsOptional()
  @IsISO8601()
  public endDate?: string;
}
