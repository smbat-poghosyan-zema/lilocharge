import type { ListReviewsQueryRequest } from '@lilocharge/shared-types';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** DTO for query parameters in list reviews endpoints. */
export class ListReviewsQueryDto implements ListReviewsQueryRequest {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  public page?: number = DEFAULT_PAGE;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  @Type(() => Number)
  public limit?: number = DEFAULT_LIMIT;
}
