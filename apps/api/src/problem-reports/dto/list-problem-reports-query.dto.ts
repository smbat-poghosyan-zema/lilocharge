import type { ListProblemReportsQueryRequest } from '@lilocharge/shared-types';
import { ProblemReportStatus } from '@lilocharge/shared-types';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/** DTO for querying problem reports with pagination and filters. */
export class ListProblemReportsQueryDto implements ListProblemReportsQueryRequest {
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

  @IsEnum(ProblemReportStatus)
  @IsOptional()
  readonly status?: ProblemReportStatus;
}
